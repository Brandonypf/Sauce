import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia, foundry } from "viem/chains";
import type { Hex } from "viem";
import { pool, tx } from "../db.js";
import { issueVoucherForOrder } from "../lib/fulfillment.js";
import { orderIdToBytes32 } from "../lib/voucher.js";
import { env } from "../env.js";

/**
 * Relayer: el unico proceso que envia transacciones.
 *
 * Este archivo es la respuesta concreta a tu pregunta sobre Kubernetes.
 *
 * La API se escala a las replicas que quieras: es sin estado, y la correccion bajo
 * concurrencia vive en los indices unicos de Postgres, no en la memoria del
 * proceso. Poner tres pods de API detras de un Service no rompe nada.
 *
 * El relayer no. Cada transaccion de Ethereum lleva un nonce que tiene que ser
 * consecutivo por cada direccion que firma. Si dos replicas leen el nonce a la vez
 * — las dos ven 42 — ambas envian una transaccion con nonce 42. Una entra, la otra
 * se rechaza o, peor, reemplaza a la primera si paga mas gas. Y como la siguiente
 * espera el 43, la cola se atasca entera.
 *
 * Escalar horizontalmente esto no lo hace mas rapido: lo rompe.
 *
 * Hay dos defensas, y estan las dos puestas a proposito:
 *
 *   1. `replicas: 1` en el Deployment del relayer (ver k8s/relayer.yaml).
 *   2. `pg_try_advisory_lock` aqui abajo, por si alguien sube las replicas sin
 *      saber por que estaban en uno. El segundo proceso arranca, no consigue el
 *      bloqueo, y se queda esperando sin tocar nada.
 *
 * La primera se puede deshacer con un `kubectl scale`. La segunda no.
 */

const RELAYER_LOCK_KEY = 918_273_645;
const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 8;

interface OutboxJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function chain() {
  // Anvil se declara explicitamente. Antes cualquier chainId distinto de
  // Arbitrum One caia en `arbitrumSepolia`, incluido el 31337 local: funcionaba
  // por coincidencia, no por decision, y un error de configuracion apuntando a
  // otra red habria pasado desapercibido.
  if (env.CHAIN_ID === arbitrum.id) return arbitrum;
  if (env.CHAIN_ID === arbitrumSepolia.id) return arbitrumSepolia;
  if (env.CHAIN_ID === foundry.id) return foundry;

  throw new Error(`CHAIN_ID ${env.CHAIN_ID} no reconocido (esperado 42161, 421614 o 31337)`);
}

function clients() {
  if (!env.RELAYER_PRIVATE_KEY) {
    throw new Error("RELAYER_PRIVATE_KEY no configurada");
  }

  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY as Hex);
  const transport = http(env.RPC_URL);

  return {
    account,
    wallet: createWalletClient({ account, chain: chain(), transport }),
    publicClient: createPublicClient({ chain: chain(), transport }),
  };
}

/**
 * Toma un trabajo pendiente.
 *
 * `FOR UPDATE SKIP LOCKED` es lo que hace segura la cola si algun dia se
 * paraleliza el trabajo que NO toca la cadena: dos workers nunca se llevan la
 * misma fila, y ninguno espera al otro.
 */
async function claimJob(jobId?: string): Promise<OutboxJob | null> {
  // Produccion: reclama el primer job elegible.
  // Pruebas: si se pasa jobId, reclama exactamente ese job para no depender
  // del orden global de una cola que puede contener trabajos anteriores.
  if (!jobId) {
    const { rows } = await pool.query<OutboxJob>(
      `UPDATE outbox
          SET status = 'processing', attempts = attempts + 1, updated_at = now()
        WHERE id = (
          SELECT id FROM outbox
           WHERE status = 'pending' AND next_attempt_at <= now()
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, kind, payload, attempts`,
    );
    return rows[0] ?? null;
  }

  const { rows } = await pool.query<OutboxJob>(
    `UPDATE outbox
        SET status = 'processing', attempts = attempts + 1, updated_at = now()
      WHERE id = $1
        AND status = 'pending'
        AND next_attempt_at <= now()
      RETURNING id, kind, payload, attempts`,
    [jobId],
  );

  return rows[0] ?? null;
}

async function completeJob(id: string, txHash: string | null): Promise<void> {
  await pool.query(
    `UPDATE outbox SET status = 'done', tx_hash = $2, updated_at = now() WHERE id = $1`,
    [id, txHash],
  );
}

async function failJob(job: OutboxJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  // Backoff exponencial con techo. Un RPC caido no debe consumir la cola entera
  // en reintentos inmediatos.
  const delaySeconds = Math.min(2 ** job.attempts, 3_600);
  const exhausted = job.attempts >= MAX_ATTEMPTS;

  await pool.query(
    `UPDATE outbox
        SET status = $2,
            last_error = $3,
            next_attempt_at = now() + ($4 || ' seconds')::interval,
            updated_at = now()
      WHERE id = $1`,
    [job.id, exhausted ? "failed" : "pending", message.slice(0, 500), delaySeconds],
  );

  if (exhausted) {
    console.error(`[relayer] trabajo ${job.id} (${job.kind}) agotado tras ${job.attempts} intentos`);
  }
}
/**
 * ABI minimo de ContentRegistry.
 *
 * Copiado a mano del ABI generado (`contracts/abi/ContentRegistry.json`) para no
 * arrastrar el archivo entero. Si cambia la firma de `registerContentWithSig`,
 * hay que actualizarlo aqui: un ABI desincronizado no falla al compilar, falla en
 * ejecucion con datos mal codificados.
 */
const creatorRegistryAbi = [
  { type: "function", name: "payoutOf", stateMutability: "view", inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "address" }] },
] as const;

const erc20Abi = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const settlementAbi = [
  { type: "function", name: "settleBatch", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "bytes32" }, { name: "payees", type: "address[]" }, { name: "grossAmounts", type: "uint256[]" }], outputs: [] },
] as const;

const contentRegistryAbi = [
  {
    type: "function",
    name: "registerContentWithSig",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "req",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "title", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "contentHash", type: "bytes32" },
          { name: "referencePrice", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "contentIdByHash",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface RegistrationRow {
  creator_address: string;
  title: string;
  metadata_uri: string;
  content_hash: string;
  reference_price: string;
  nonce: string;
  deadline: string;
  signature: string;
  chain_id: string;
  verifying_contract: string;
  tx_hash: string | null;
  content_id: string | null;
}

/**
 * Registra una obra en la cadena usando la firma del creador.
 *
 * El relayer NO puede llamar a `registerContent`: esa funcion exige que
 * `msg.sender` sea el creador, y aqui firma la plataforma. La transaccion
 * revertiria siempre. Por eso se usa `registerContentWithSig`, donde el creador
 * firma fuera de cadena y el relayer solo envia y paga el gas.
 *
 * Idempotencia en tres capas, porque cada una cubre un fallo distinto:
 *
 *   1. `works.content_id` ya escrito  → el trabajo ya termino, no se repite.
 *   2. `contentIdByHash` on-chain     → la transaccion entro pero el proceso
 *                                       murio antes de guardar. Se recupera el
 *                                       id sin gastar gas otra vez.
 *   3. `tx_hash` guardado             → se envio y no se confirmo; se espera el
 *                                       recibo en vez de mandar otra.
 */
async function registerContent(workId: string): Promise<string | null> {
  const { rows } = await pool.query<RegistrationRow>(
    `SELECT r.creator_address, r.title, r.metadata_uri, r.content_hash,
            r.reference_price, r.nonce, r.deadline, r.signature,
            r.chain_id, r.verifying_contract, r.tx_hash,
            w.content_id
       FROM content_registrations r
       JOIN works w ON w.id = r.work_id
      WHERE r.work_id = $1`,
    [workId],
  );

  const reg = rows[0];

  if (!reg) {
    // El creador todavia no ha firmado. No es un error: se reintenta hasta que
    // firme o hasta agotar los intentos.
    throw new Error(`La obra ${workId} no tiene firma de registro todavia`);
  }

  // Capa 1: ya esta hecho.
  if (reg.content_id) {
    console.log(`[relayer] ${workId} ya tiene content_id ${reg.content_id}`);
    return null;
  }

  // El dominio EIP-712 incluye chainId y verifyingContract. Si el backend se
  // reconfiguro a otra red o se redesplego el contrato, la firma vieja no vale y
  // enviarla solo gastaria gas para revertir.
  if (Number(reg.chain_id) !== env.CHAIN_ID) {
    throw new Error(
      `Firma para chainId ${reg.chain_id}, el backend esta en ${env.CHAIN_ID}`,
    );
  }

  const registry = env.CONTENT_REGISTRY_ADDRESS as `0x${string}`;

  if (reg.verifying_contract.toLowerCase() !== registry.toLowerCase()) {
    throw new Error("La firma apunta a otro ContentRegistry");
  }

  const { wallet, publicClient } = clients();
  const contentHash = reg.content_hash as `0x${string}`;

  // Capa 2: la transaccion pudo entrar aunque no llegaramos a guardarlo.
  const yaEnCadena = await publicClient.readContract({
    address: registry,
    abi: contentRegistryAbi,
    functionName: "contentIdByHash",
    args: [contentHash],
  });

  if (yaEnCadena > 0n) {
    await saveContentId(workId, yaEnCadena, reg.tx_hash);
    console.log(`[relayer] ${workId} ya estaba en cadena con id ${yaEnCadena}`);
    return reg.tx_hash;
  }

  // Capa 3: se envio y no sabemos si confirmo.
  let hash = reg.tx_hash as `0x${string}` | null;

  if (!hash) {
    const request = {
      address: registry,
      abi: contentRegistryAbi,
      functionName: "registerContentWithSig",
      args: [
        {
          creator: reg.creator_address as `0x${string}`,
          title: reg.title,
          metadataURI: reg.metadata_uri,
          contentHash,
          referencePrice: BigInt(reg.reference_price),
          nonce: BigInt(reg.nonce),
          deadline: BigInt(reg.deadline),
        },
        reg.signature as `0x${string}`,
      ],
      account: wallet.account,
    } as const;

    // Simular antes de gastar gas convierte los custom errors del contrato en
    // errores accionables y evita quemar ETH por firmas/nonce/red incorrectos.
    await publicClient.simulateContract(request);
    hash = await wallet.writeContract(request);

    // Se guarda ANTES de esperar el recibo. Si el proceso muere durante la
    // espera, al reiniciar sabemos que hay una transaccion en vuelo y no
    // enviamos otra: eso duplicaria el gasto y consumiria el nonce del creador.
    await pool.query(
      `UPDATE content_registrations SET tx_hash = $2, submitted_at = now() WHERE work_id = $1`,
      [workId, hash],
    );
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

  if (receipt.status !== "success") {
    // La transaccion revirtio. Se limpia el hash para que el siguiente intento
    // mande una nueva en vez de quedarse esperando esta para siempre.
    await pool.query(
      `UPDATE content_registrations SET tx_hash = NULL, submitted_at = NULL WHERE work_id = $1`,
      [workId],
    );

    throw new Error(`La transaccion ${hash} revirtio`);
  }

  // El contentId se lee del contrato y no del log: `contentIdByHash` es la
  // fuente de verdad y evita depender de decodificar eventos.
  const contentId = await publicClient.readContract({
    address: registry,
    abi: contentRegistryAbi,
    functionName: "contentIdByHash",
    args: [contentHash],
  });

  if (contentId === 0n) {
    throw new Error("La transaccion confirmo pero no hay contentId");
  }

  await saveContentId(workId, contentId, hash);

  console.log(`[relayer] ${workId} registrado on-chain: contentId=${contentId} tx=${hash}`);

  return hash;
}

/**
 * Escribe el contentId y encola la emision del voucher.
 *
 * Las dos cosas van en la misma transaccion: si se escribiera el id sin encolar,
 * las compras hechas antes del registro se quedarian sin recibo para siempre.
 */
async function saveContentId(
  workId: string,
  contentId: bigint,
  txHash: string | null,
): Promise<void> {
  await tx(async (db) => {
    await db.query("UPDATE works SET content_id = $2 WHERE id = $1 AND content_id IS NULL", [
      workId,
      contentId.toString(),
    ]);

    await db.query(
      `UPDATE content_registrations
          SET confirmed_at = now(), tx_hash = COALESCE($2, tx_hash)
        WHERE work_id = $1`,
      [workId, txHash],
    );

    // Ordenes ya pagadas de esta obra que se quedaron sin voucher por no haber
    // contentId cuando se cumplieron.
    await db.query(
      `INSERT INTO outbox (kind, payload)
       SELECT 'issue_voucher', jsonb_build_object('orderId', o.id)
         FROM orders o
        WHERE o.work_id = $1
          AND o.status = 'paid'
          AND NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.order_id = o.id)`,
      [workId],
    );
  });
}

async function settleOrder(orderId: string): Promise<string | null> {
  const { rows } = await pool.query<{
    status: string;
    usdc_amount: string;
    creator_address: string | null;
    payout: string | null;
    tx_hash: string | null;
    batch_uuid: string | null;
    batch_status: string | null;
  }>(`
    SELECT o.status, o.usdc_amount,
           r.creator_address,
           sb.id AS batch_uuid, sb.tx_hash, sb.status AS batch_status,
           NULL::text AS payout
      FROM orders o
      JOIN works w ON w.id = o.work_id
 LEFT JOIN content_registrations r ON r.work_id = w.id
 LEFT JOIN settlement_lines sl ON sl.order_id = o.id
 LEFT JOIN settlement_batches sb ON sb.id = sl.batch_id
     WHERE o.id = $1
  `, [orderId]);

  const order = rows[0];
  if (!order) throw new Error(`Orden ${orderId} no existe`);
  if (order.status !== "paid") throw new Error(`Orden ${orderId} no esta pagada`);
  if (!order.creator_address) throw new Error(`La obra de ${orderId} no tiene creador on-chain`);
  if (order.batch_status === "confirmed") return order.tx_hash;

  const { wallet, publicClient } = clients();
  const payout = await publicClient.readContract({
    address: env.CREATOR_REGISTRY_ADDRESS as `0x${string}`,
    abi: creatorRegistryAbi,
    functionName: "payoutOf",
    args: [order.creator_address as `0x${string}`],
  });

  const batchId = orderIdToBytes32(orderId);
  const gross = BigInt(order.usdc_amount);

  let batchUuid = order.batch_uuid;
  if (!batchUuid) {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO settlement_batches (batch_id, epoch_start, epoch_end, gross_usdc, status)\n       VALUES ($1, now(), now(), $2, 'pending')\n       ON CONFLICT (batch_id) DO UPDATE SET batch_id = EXCLUDED.batch_id\n       RETURNING id`,
      [batchId, gross.toString()],
    );
    batchUuid = created.rows[0]!.id;
    await pool.query(
      `INSERT INTO settlement_lines (batch_id, order_id, creator_id, usdc_amount)\n       SELECT $1, o.id, w.creator_id, $2 FROM orders o JOIN works w ON w.id = o.work_id\n       WHERE o.id = $3 ON CONFLICT (order_id) DO NOTHING`,
      [batchUuid, gross.toString(), orderId],
    );
  }

  let txHash = order.tx_hash as `0x${string}` | null;
  if (!txHash) {
    const allowance = await publicClient.readContract({
      address: env.USDC_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet.account.address, env.SETTLEMENT_VAULT_ADDRESS as `0x${string}`],
    });
    if (allowance < gross) {
      const approveHash = await wallet.writeContract({
        address: env.USDC_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [env.SETTLEMENT_VAULT_ADDRESS as `0x${string}`, 2n ** 256n - 1n],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const simulation = await publicClient.simulateContract({
      address: env.SETTLEMENT_VAULT_ADDRESS as `0x${string}`,
      abi: settlementAbi,
      functionName: "settleBatch",
      args: [batchId, [payout], [gross]],
      account: wallet.account,
    });
    txHash = await wallet.writeContract(simulation.request);
    await pool.query(
      `UPDATE settlement_batches SET status = 'submitted', tx_hash = $2 WHERE id = $1`,
      [batchUuid, txHash],
    );
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`Settlement ${txHash} revirtio`);

  await pool.query(
    `UPDATE settlement_batches SET status = 'confirmed', tx_hash = $2 WHERE id = $1`,
    [batchUuid, txHash],
  );
  return txHash;
}

async function processJob(job: OutboxJob): Promise<string | null> {
  switch (job.kind) {
    case "register_content": {
      const { workId } = job.payload as { workId: string };
      return registerContent(workId);
    }

    case "issue_voucher": {
      const { orderId } = job.payload as { orderId: string };
      const issued = await issueVoucherForOrder(pool, orderId);
      if (!issued) throw new Error(`El voucher ${orderId} aun no puede emitirse: falta wallet o content_id`);
      console.log(`[relayer] voucher emitido para ${orderId}`);
      return null;
    }

    case "settle_order": {
      const { orderId } = job.payload as { orderId: string };
      return settleOrder(orderId);
    }

    default:
      throw new Error(`Tipo de trabajo desconocido: ${job.kind}`);
  }
}

async function acquireLock(): Promise<boolean> {
  const { rows } = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [RELAYER_LOCK_KEY],
  );

  return rows[0]?.locked ?? false;
}

export async function runRelayer(signal?: AbortSignal): Promise<void> {
  // El bloqueo se toma sobre una conexion dedicada: los bloqueos consultivos de
  // sesion se sueltan solos si el proceso muere, asi que un pod que se cae libera
  // el puesto sin intervencion.
  const client = await pool.connect();

  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [RELAYER_LOCK_KEY],
  );

  if (!rows[0]?.locked) {
    console.warn("[relayer] otro relayer ya tiene el bloqueo. Este proceso queda inactivo.");
    client.release();
    return;
  }

  console.log("[relayer] bloqueo adquirido, procesando cola");

  try {
    while (!signal?.aborted) {
      const job = await claimJob();

      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      try {
        const txHash = await processJob(job);
        await completeJob(job.id, txHash);
      } catch (error) {
        await failJob(job, error);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [RELAYER_LOCK_KEY]);
    client.release();
  }
}

/**
 * Procesa un solo trabajo y vuelve. Devuelve `false` si la cola estaba vacia.
 *
 * Existe para poder probar el relayer sin arrancar el bucle infinito ni el
 * bloqueo consultivo: las pruebas necesitan control sobre cuando se ejecuta cada
 * paso, y `runRelayer` no lo permite.
 */
export async function runOnce(jobId?: string): Promise<boolean> {
  const job = await claimJob(jobId);

  if (!job) return false;

  try {
    const txHash = await processJob(job);
    await completeJob(job.id, txHash);
  } catch (error) {
    await failJob(job, error);
  }

  return true;
}

export { acquireLock, claimJob, completeJob, failJob };

if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new AbortController();

  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  await runRelayer(controller.signal);
  await pool.end();
}
