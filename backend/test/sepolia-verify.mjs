/**
 * Verificación de la Fase 7 contra Arbitrum Sepolia REAL.
 *
 * No usa Anvil, ni mocks, ni `app.inject`: habla con el backend levantado por
 * HTTP y con la cadena por RPC. Gasta ETH de testnet de verdad.
 *
 * Uso:
 *
 *   cd backend
 *   npm run dev                    # con el .env de Sepolia
 *   RELAYER_PRIVATE_KEY=0x... \
 *   CREATOR_PRIVATE_KEY=0x... \
 *   node test/sepolia-verify.mjs
 *
 * `CREATOR_PRIVATE_KEY` es la wallet que firma como creador. Puede ser la misma
 * que el relayer para la prueba, pero conviene que sean distintas: eso es lo que
 * demuestra que `msg.sender` y el autor no son la misma persona, que es el punto
 * entero de `registerContentWithSig`.
 */
// El resto del backend usa `--env-file=.env`; aqui se carga explicitamente para
// que `node test/sepolia-verify.mjs` funcione sin recordar esa bandera.
import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import pg from "pg";

const API = process.env.API_URL ?? "http://127.0.0.1:4000";
const RPC = process.env.RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const REGISTRY = (process.env.CONTENT_REGISTRY_ADDRESS ?? "").toLowerCase();
const CREATOR_REGISTRY = (process.env.CREATOR_REGISTRY_ADDRESS ?? "").toLowerCase();
const DB = process.env.DATABASE_URL;

const faltan = [
  ["CONTENT_REGISTRY_ADDRESS", REGISTRY],
  ["CREATOR_REGISTRY_ADDRESS", CREATOR_REGISTRY],
  ["DATABASE_URL", DB],
  ["CREATOR_PRIVATE_KEY", process.env.CREATOR_PRIVATE_KEY],
  ["RELAYER_PRIVATE_KEY", process.env.RELAYER_PRIVATE_KEY],
].filter(([, valor]) => !valor).map(([nombre]) => nombre);

if (faltan.length) {
  console.error(`\nFaltan variables: ${faltan.join(", ")}\n`);
  console.error("Las tres direcciones y RELAYER_PRIVATE_KEY salen de backend/.env.");
  console.error("CREATOR_PRIVATE_KEY se pasa aparte: es la wallet del CREADOR, que");
  console.error("debe ser distinta de la del relayer para que la prueba demuestre algo.\n");
  console.error("  CREATOR_PRIVATE_KEY=0x... node test/sepolia-verify.mjs\n");
  process.exit(1);
}

// Si ambas coinciden la prueba pasa igual, pero no demuestra lo que pretende:
// el sentido de registerContentWithSig es que `msg.sender` NO sea el autor.
if (
  process.env.CREATOR_PRIVATE_KEY.toLowerCase() ===
  process.env.RELAYER_PRIVATE_KEY.toLowerCase()
) {
  console.warn(
    "\n  AVISO: creador y relayer son la misma wallet. La prueba corre, pero no\n" +
      "  demuestra la separacion entre quien firma y quien paga el gas.\n",
  );
}

const pool = new pg.Pool({ connectionString: DB });
const creador = privateKeyToAccount(process.env.CREATOR_PRIVATE_KEY);

const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });
const creatorWallet = createWalletClient({
  account: creador,
  chain: arbitrumSepolia,
  transport: http(RPC),
});

const registryAbi = parseAbi([
  "function nonces(address) view returns (uint256)",
  "function contentIdByHash(bytes32) view returns (uint256)",
]);

const creatorRegistryAbi = parseAbi([
  "function registerCreator(string name,string profileURI,address payout)",
  "function isRegisteredCreator(address) view returns (bool)",
]);

let ok = 0;
let bad = 0;

function check(cond, label, extra = "") {
  console.log(`  ${cond ? "ok   " : "FALLA"} ${label}${extra ? ` — ${extra}` : ""}`);
  cond ? ok++ : bad++;
  return cond;
}

function cookieOf(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).find((c) => c.startsWith("sauce_session=")) ?? "";
}

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return { res, json: await res.json().catch(() => null) };
}

// ─────────────────────────────────────────── 0. entorno

console.log("\n━━ 0. ENTORNO");

const chainId = await publicClient.getChainId();

if (chainId !== 421614) {
  // Abortar en vez de seguir: contra otra red las direcciones no existen y cada
  // paso fallaria por una razon distinta, ocultando la causa real.
  console.error(`\n  El RPC responde chainId ${chainId}, se esperaba 421614.\n`);
  process.exit(1);
}

check(true, "el RPC responde Arbitrum Sepolia", `chainId=${chainId}`);

const code = await publicClient.getBytecode({ address: REGISTRY });
check(Boolean(code && code.length > 2), "ContentRegistry tiene bytecode", REGISTRY);

const saldo = await publicClient.getBalance({ address: creador.address });
check(saldo > 0n, "el creador tiene ETH para registrarse", `${Number(saldo) / 1e18} ETH`);

// ─────────────────────────────────────────── 1. creador en cadena

console.log("\n━━ 1. CREADOR ON-CHAIN");

let registrado = false;

if (CREATOR_REGISTRY) {
  registrado = await publicClient.readContract({
    address: CREATOR_REGISTRY,
    abi: creatorRegistryAbi,
    functionName: "isRegisteredCreator",
    args: [creador.address],
  });

  if (!registrado) {
    console.log("  … registrando al creador en CreatorRegistry (gasta gas)");

    const h = await creatorWallet.writeContract({
      address: CREATOR_REGISTRY,
      abi: creatorRegistryAbi,
      functionName: "registerCreator",
      args: ["Estudio Verificacion", "ipfs://perfil", "0x0000000000000000000000000000000000000000"],
    });

    await publicClient.waitForTransactionReceipt({ hash: h });
    registrado = true;
  }
}

check(registrado, "el creador esta registrado on-chain", creador.address);

// ─────────────────────────────────────────── 2. cuenta y obra

console.log("\n━━ 2. CUENTA, SUBIDA Y PUBLICACION");

const email = `sepolia-${randomUUID().slice(0, 8)}@sauce.test`;
const password = "una-frase-larga-y-seguraa";

const reg = await call("POST", "/api/auth/register", { body: { email, password } });
let cookie = cookieOf(reg.res);
check(reg.res.status === 200, "cuenta creada");

// Vincular la wallet del creador: el backend exige que la firma venga de la
// wallet de la cuenta.
const { json: nonceJson } = await call("GET", "/api/auth/nonce");
const siwe = [
  "SAUCE quiere que inicies sesion con tu wallet.",
  "",
  `Direccion: ${creador.address}`,
  `Nonce: ${nonceJson.nonce}`,
  "",
  "Firmar no cuesta gas y no autoriza ninguna transaccion.",
].join("\n");

const siweSig = await creatorWallet.signMessage({ message: siwe });

const link = await call("POST", "/api/auth/link-wallet", {
  cookie,
  body: { address: creador.address, nonce: nonceJson.nonce, signature: siweSig },
});
if (link.res.status === 200) {
  check(true, "wallet vinculada a la cuenta");
} else if (link.res.status === 409 && link.json?.error === "wallet_in_use") {
  // La prueba se puede repetir con la misma wallet. Si ya pertenece a una cuenta
  // de una ejecucion anterior, iniciamos sesion con esa identidad en vez de
  // falsear el resultado o intentar mover la wallet de propietario.
  const nonce2 = await call("GET", "/api/auth/nonce");
  const message2 = [
    "SAUCE quiere que inicies sesion con tu wallet.", "", `Direccion: ${creador.address}`,
    `Nonce: ${nonce2.json.nonce}`, "", "Firmar no cuesta gas y no autoriza ninguna transaccion.",
  ].join("\n");
  const sig2 = await creatorWallet.signMessage({ message: message2 });
  const login = await call("POST", "/api/auth/verify", {
    body: { address: creador.address, nonce: nonce2.json.nonce, signature: sig2 },
  });
  const walletCookie = cookieOf(login.res);
  if (login.res.status === 200 && walletCookie) cookie = walletCookie;
  check(login.res.status === 200 && Boolean(walletCookie), "wallet ya existente: sesion reutilizada", creador.address);
} else {
  check(false, "wallet vinculada a la cuenta", `${link.res.status} ${link.json?.error ?? ""}`.trim());
}

await call("POST", "/api/creators", {
  cookie,
  body: { handle: `sep${Date.now() % 1_000_000}`, name: "Estudio Verificacion" },
});

const archivo = Buffer.from(`obra-sepolia-${randomUUID()}`.repeat(20));
const checksum = createHash("sha256").update(archivo).digest("hex");

const reserva = await call("POST", "/api/uploads", {
  cookie,
  body: {
    filename: "obra.pdf",
    mimeType: "application/pdf",
    sizeBytes: archivo.length,
    checksum,
    purpose: "content",
  },
});

await fetch(reserva.json.upload.url, { method: "PUT", body: archivo });
await call("POST", `/api/uploads/${reserva.json.uploadId}/complete`, {
  cookie,
  body: { checksum },
});

const pub = await call("POST", "/api/works", {
  cookie,
  body: {
    title: `Sepolia ${Date.now() % 100000}`,
    category: "visual_novel",
    uploadId: reserva.json.uploadId,
    priceMinor: 1000,
  },
});

const slug = pub.json?.work?.slug;
check(Boolean(slug), "obra publicada", slug);

// ─────────────────────────────────────────── 3. firma EIP-712

console.log("\n━━ 3. FIRMA EIP-712");

const info = await call("GET", `/api/works/${slug}/registration`, { cookie });
check(info.res.status === 200, "el backend devuelve el request de registro");
check(
  info.json.verifyingContract.toLowerCase() === REGISTRY,
  "verifyingContract coincide con el desplegado",
);
check(info.json.chainId === 421614, "chainId = 421614");

const nonce = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "nonces",
  args: [creador.address],
});

const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const domain = {
  name: "SauceContentRegistry",
  version: "1",
  chainId: 421614,
  verifyingContract: REGISTRY,
};

const types = {
  RegisterContent: [
    { name: "creator", type: "address" },
    { name: "title", type: "string" },
    { name: "metadataURI", type: "string" },
    { name: "contentHash", type: "bytes32" },
    { name: "referencePrice", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
};

const message = {
  creator: creador.address,
  title: info.json.title,
  metadataURI: info.json.metadataURI ?? "",
  contentHash: info.json.contentHash,
  referencePrice: 0n,
  nonce,
  deadline,
};

const signature = await creatorWallet.signTypedData({
  domain,
  types,
  primaryType: "RegisterContent",
  message,
});

check(/^0x[0-9a-f]{130}$/.test(signature), "firma de 65 bytes generada");

const guardada = await call("POST", `/api/works/${slug}/registration`, {
  cookie,
  body: {
    creatorAddress: creador.address,
    title: info.json.title,
    metadataURI: info.json.metadataURI ?? "",
    contentHash: info.json.contentHash,
    referencePrice: "0",
    nonce: nonce.toString(),
    deadline: Number(deadline),
    signature,
    chainId: 421614,
    verifyingContract: REGISTRY,
  },
});

check(guardada.res.status === 200, "firma almacenada en el backend");

const enDb = await pool.query("SELECT signature, chain_id FROM content_registrations WHERE work_id = $1", [
  guardada.json.workId,
]);
check(enDb.rows[0]?.signature === signature, "la firma guardada es la misma");

const trabajo = await pool.query(
  `SELECT id, status FROM outbox WHERE kind = 'register_content' AND payload->>'workId' = $1 ORDER BY created_at DESC LIMIT 1`,
  [guardada.json.workId],
);
check(trabajo.rowCount > 0, "existe el trabajo register_content en outbox");
const registrationJobId = trabajo.rows[0]?.id;

// ─────────────────────────────────────────── 4. relayer real

console.log("\n━━ 4. RELAYER CONTRA SEPOLIA (gasta gas)");

const { runOnce } = await import("../src/relayer/index.js");

const t0 = Date.now();
// Procesar exactamente el job que acabamos de crear. La cola puede contener
// trabajos de ejecuciones anteriores y runOnce() sin argumento no garantiza
// que tome este register_content.
await runOnce(registrationJobId);
console.log(`  … relayer ejecutado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const tras = await pool.query(
  `SELECT r.tx_hash, r.confirmed_at, w.content_id
     FROM content_registrations r JOIN works w ON w.id = r.work_id
    WHERE r.work_id = $1`,
  [guardada.json.workId],
);

const outboxState = await pool.query(
  `SELECT status, attempts, last_error, tx_hash
     FROM outbox
    WHERE kind = 'register_content' AND payload->>'workId' = $1
    ORDER BY created_at DESC LIMIT 1`,
  [guardada.json.workId],
);
if (!tras.rows[0]?.tx_hash && outboxState.rows[0]?.last_error) {
  console.log(`\n  RELAYER ERROR: ${outboxState.rows[0].last_error}`);
}

const txHash = tras.rows[0]?.tx_hash;
check(Boolean(txHash), "se envio una transaccion", txHash);

if (txHash) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

  check(receipt.status === "success", "receipt status = success");
  check(
    receipt.to?.toLowerCase() === REGISTRY,
    "la transaccion fue a ContentRegistry",
    receipt.to,
  );

  console.log(`\n  TX:    ${txHash}`);
  console.log(`  BLOCK: ${receipt.blockNumber}`);
  console.log(`  GAS:   ${receipt.gasUsed}`);
  console.log(`  https://sepolia.arbiscan.io/tx/${txHash}`);
}

const onchain = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "contentIdByHash",
  args: [info.json.contentHash],
});

check(onchain > 0n, "contentIdByHash devuelve un id", onchain.toString());
check(
  String(tras.rows[0]?.content_id) === onchain.toString(),
  "works.content_id coincide con la cadena",
  `db=${tras.rows[0]?.content_id} chain=${onchain}`,
);
check(Boolean(tras.rows[0]?.confirmed_at), "content_registrations marcado como confirmado");

// ─────────────────────────────────────────── 5. idempotencia real

console.log("\n━━ 5. IDEMPOTENCIA (no debe gastar gas)");

const saldoAntes = await publicClient.getBalance({
  address: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY).address,
});

const retryJob = await pool.query(
  `INSERT INTO outbox (kind, payload) VALUES ('register_content', $1) RETURNING id`,
  [JSON.stringify({ workId: guardada.json.workId })],
);

await runOnce(retryJob.rows[0].id);

const saldoDespues = await publicClient.getBalance({
  address: privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY).address,
});

const segunda = await pool.query(
  "SELECT tx_hash FROM content_registrations WHERE work_id = $1",
  [guardada.json.workId],
);

check(segunda.rows[0]?.tx_hash === txHash, "se conserva el tx_hash original");
check(saldoDespues === saldoAntes, "NO se gasto gas en el reintento");

console.log(`\n${bad === 0 ? "SEPOLIA VERIFICADO ✓" : `${bad} FALLOS`} — ${ok} comprobaciones\n`);

await pool.end();
process.exit(bad === 0 ? 0 : 1);
