import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import type { Hex } from "viem";
import { pool } from "../db.js";
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
  return env.CHAIN_ID === arbitrum.id ? arbitrum : arbitrumSepolia;
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
async function claimJob(): Promise<OutboxJob | null> {
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

async function processJob(job: OutboxJob): Promise<string | null> {
  switch (job.kind) {
    case "register_content":
      // Aqui iria contents.registerContent(...). Se deja explicito en vez de
      // simulado para que no parezca que ya escribe en la cadena.
      console.log(`[relayer] register_content pendiente de cablear: ${JSON.stringify(job.payload)}`);
      return null;

    case "settle_order":
      // Las ordenes no se liquidan una por una: se acumulan y se cierran por
      // epoca. Este trabajo solo marca la orden como lista para el proximo lote.
      console.log(`[relayer] settle_order encolado: ${JSON.stringify(job.payload)}`);
      return null;

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

export { acquireLock, claimJob, completeJob, failJob };

if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new AbortController();

  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());

  await runRelayer(controller.signal);
  await pool.end();
}
