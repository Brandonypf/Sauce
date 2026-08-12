/**
 * Relayer contra una cadena REAL (Anvil local).
 *
 * No se simula la cadena ni se finge que es Sepolia: se despliega
 * `ContentRegistry` en Anvil, se firma con una llave real, y se comprueba que la
 * transaccion entra y que `works.content_id` acaba escrito.
 *
 * Requiere Anvil corriendo y CONTENT_REGISTRY_ADDRESS apuntando al despliegue.
 * Si no estan, la suite se salta entera en vez de dar un falso verde.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const REGISTRY = process.env.CONTENT_REGISTRY_ADDRESS;

const testUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/sauce_test";

if (/supabase|pooler\.supabase|amazonaws/i.test(testUrl)) {
  throw new Error("Las pruebas NO pueden correr contra una base remota.");
}

process.env.DATABASE_URL = testUrl;
process.env.CHAIN_ID = "31337";
process.env.ISSUER_PRIVATE_KEY ??=
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Cuenta 1 de Anvil: el relayer paga el gas, y NO es el creador.
process.env.RELAYER_PRIVATE_KEY ??=
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const disponible = Boolean(REGISTRY) && REGISTRY !== "0x0000000000000000000000000000000000000000";

const { pool } = await import("../src/db.js");
const { migrate } = await import("../src/lib/migrate.js");

// Cuenta 2 de Anvil: el creador. Solo firma, nunca envia.
const creador = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const creatorWallet = createWalletClient({ account: creador, chain: foundry, transport: http(RPC) });

const creatorRegistryAbi = parseAbi([
  "function registerCreator(string name,string profileURI,address payout)",
  "function isRegisteredCreator(address creator) view returns (bool)",
]);

const registryAbi = parseAbi([
  "function nonces(address) view returns (uint256)",
  "function contentIdByHash(bytes32) view returns (uint256)",
]);

before(async () => {
  await migrate();
});

after(async () => {
  await pool.end();
});

/** Crea usuario, creador y obra en la base; devuelve el workId. */
async function seedWork(contentHash: string, _wallet: string) {
  // Usuario nuevo en cada prueba, SIN wallet: `users.wallet` es unico y todas
  // las obras las firma el mismo creador on-chain. La direccion que importa es
  // la de `content_registrations.creator_address`, no la de `users`.
  // Con `password_hash`: la restriccion `users_email_needs_password` de la
  // migracion 004 exige que una cuenta con email pueda iniciar sesion.
  const u = await pool.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [`rel-${randomUUID().slice(0, 8)}@sauce.test`, "$2a$04$abcdefghijklmnopqrstuv"],
  );

  const c = await pool.query<{ id: string }>(
    "INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, 'Rel') RETURNING id",
    [u.rows[0].id, `rel${Date.now() % 1_000_000}${Math.floor(Math.random() * 999)}`],
  );

  const w = await pool.query<{ id: string }>(
    `INSERT INTO works (creator_id, slug, title, category, format, content_hash,
                        price_minor, status, published_at)
     VALUES ($1, $2, 'Obra relayer', 'visual_novel', 'visual_novel', $3, 1000, 'published', now())
     RETURNING id`,
    [c.rows[0].id, `rel-${randomUUID().slice(0, 8)}`, contentHash],
  );

  return w.rows[0].id;
}

async function firmar(workId: string, contentHash: string, deadline: bigint, nonce?: bigint) {
  const n =
    nonce ??
    (await publicClient.readContract({
      address: REGISTRY as `0x${string}`,
      abi: registryAbi,
      functionName: "nonces",
      args: [creador.address],
    }));

  const signature = await creatorWallet.signTypedData({
    domain: {
      name: "SauceContentRegistry",
      version: "1",
      chainId: 31337,
      verifyingContract: REGISTRY as `0x${string}`,
    },
    types: {
      RegisterContent: [
        { name: "creator", type: "address" },
        { name: "title", type: "string" },
        { name: "metadataURI", type: "string" },
        { name: "contentHash", type: "bytes32" },
        { name: "referencePrice", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint64" },
      ],
    },
    primaryType: "RegisterContent",
    message: {
      creator: creador.address,
      title: "Obra relayer",
      metadataURI: "",
      contentHash: contentHash as `0x${string}`,
      referencePrice: 0n,
      nonce: n,
      deadline,
    },
  });

  await pool.query(
    `INSERT INTO content_registrations
       (work_id, creator_address, title, metadata_uri, content_hash,
        reference_price, nonce, deadline, signature, chain_id, verifying_contract)
     VALUES ($1, $2, 'Obra relayer', '', $3, 0, $4, $5, $6, 31337, $7)`,
    [
      workId,
      creador.address.toLowerCase(),
      contentHash,
      n.toString(),
      Number(deadline),
      signature,
      (REGISTRY as string).toLowerCase(),
    ],
  );

  return signature;
}

describe("relayer: register_content", { skip: !disponible }, () => {
  test("registra la obra on-chain y guarda el content_id", async () => {
    // El creador se registra en la cadena (esto si lo hace el mismo).
    const yaEs = await publicClient.readContract({
      address: process.env.CREATOR_REGISTRY_ADDRESS as `0x${string}`,
      abi: creatorRegistryAbi,
      functionName: "isRegisteredCreator",
      args: [creador.address],
    });

    if (!yaEs) {
      const h = await creatorWallet.writeContract({
        address: process.env.CREATOR_REGISTRY_ADDRESS as `0x${string}`,
        abi: creatorRegistryAbi,
        functionName: "registerCreator",
        args: ["Estudio", "ipfs://p", "0x0000000000000000000000000000000000000000"],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
    }

    const contentHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 66);
    const workId = await seedWork(contentHash, creador.address);

    await firmar(workId, contentHash, BigInt(Math.floor(Date.now() / 1000) + 3600));

    const { runOnce } = await import("../src/relayer/index.js");

    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);

    await runOnce();

    const { rows } = await pool.query("SELECT content_id FROM works WHERE id = $1", [workId]);
    assert.ok(rows[0].content_id, "works.content_id debe quedar escrito");

    // Y coincide con lo que dice la cadena, no solo con lo que guardamos.
    const onchain = await publicClient.readContract({
      address: REGISTRY as `0x${string}`,
      abi: registryAbi,
      functionName: "contentIdByHash",
      args: [contentHash as `0x${string}`],
    });

    assert.equal(BigInt(rows[0].content_id), onchain, "el id guardado es el de la cadena");

    const reg = await pool.query("SELECT tx_hash, confirmed_at FROM content_registrations WHERE work_id = $1", [workId]);
    assert.ok(reg.rows[0].tx_hash, "se guarda el hash de la transaccion");
    assert.ok(reg.rows[0].confirmed_at, "se marca como confirmada");
  });

  test("reejecutar el trabajo no envia otra transaccion", async () => {
    const contentHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 66);
    const workId = await seedWork(contentHash, creador.address);

    await firmar(workId, contentHash, BigInt(Math.floor(Date.now() / 1000) + 3600));

    const { runOnce } = await import("../src/relayer/index.js");

    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);
    await runOnce();

    const primera = await pool.query("SELECT tx_hash FROM content_registrations WHERE work_id = $1", [workId]);

    // Mismo trabajo otra vez: debe salir por la capa de idempotencia.
    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);
    await runOnce();

    const segunda = await pool.query("SELECT tx_hash FROM content_registrations WHERE work_id = $1", [workId]);

    assert.equal(segunda.rows[0].tx_hash, primera.rows[0].tx_hash, "no se envia una segunda tx");
  });

  test("una firma caducada no se envia", async () => {
    const contentHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 66);
    const workId = await seedWork(contentHash, creador.address);

    // Deadline en el pasado.
    await firmar(workId, contentHash, BigInt(Math.floor(Date.now() / 1000) - 60));

    const { runOnce } = await import("../src/relayer/index.js");

    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);
    await runOnce();

    const { rows } = await pool.query("SELECT content_id FROM works WHERE id = $1", [workId]);
    assert.equal(rows[0].content_id, null, "no debe registrarse con firma caducada");
  });

  test("sin firma el trabajo se reintenta, no se pierde", async () => {
    const contentHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 66);
    const workId = await seedWork(contentHash, creador.address);

    const { runOnce } = await import("../src/relayer/index.js");

    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);
    await runOnce();

    const { rows } = await pool.query(
      `SELECT status, attempts, last_error FROM outbox
        WHERE payload->>'workId' = $1 ORDER BY created_at DESC LIMIT 1`,
      [workId],
    );

    assert.equal(rows[0].status, "pending", "vuelve a la cola");
    assert.match(rows[0].last_error, /firma/i, "el error explica que falta la firma");
  });

  test("una firma para otra red se rechaza sin gastar gas", async () => {
    const contentHash = `0x${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 66);
    const workId = await seedWork(contentHash, creador.address);

    await firmar(workId, contentHash, BigInt(Math.floor(Date.now() / 1000) + 3600));

    // Se cambia el chainId guardado: simula una firma hecha para Sepolia y
    // enviada a un backend configurado en local.
    await pool.query("UPDATE content_registrations SET chain_id = 421614 WHERE work_id = $1", [workId]);

    const { runOnce } = await import("../src/relayer/index.js");

    await pool.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
      JSON.stringify({ workId }),
    ]);
    await runOnce();

    const { rows } = await pool.query(
      `SELECT last_error FROM outbox WHERE payload->>'workId' = $1 ORDER BY created_at DESC LIMIT 1`,
      [workId],
    );

    assert.match(rows[0].last_error, /chainId/i);
  });
});

if (!disponible) {
  console.log(
    "\n[relayer] SALTADO: falta Anvil o CONTENT_REGISTRY_ADDRESS.\n" +
      "  anvil &\n" +
      "  forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \\\n" +
      "    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80\n",
  );
}
