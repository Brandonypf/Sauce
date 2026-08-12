import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/**
 * Sin este listener el proceso MUERE.
 *
 * `pg.Pool` es un EventEmitter. Cuando una conexion inactiva se rompe —y
 * Supabase las corta con regularidad: cierra las inactivas, reinicia el pooler,
 * pausa el proyecto en el plan gratuito— el pool emite `error`. En Node, un
 * evento `error` sin oyente lanza como excepcion no capturada y tumba Fastify
 * entero.
 *
 * Lo importante es QUE no hace: no traga el error ni devuelve la conexion rota
 * al servicio. `pg` ya la ha descartado del pool antes de emitir; la siguiente
 * peticion abre una nueva. Aqui solo se deja constancia para que un problema
 * real de red siga siendo visible en los logs.
 */
pool.on("error", (error, client) => {
  console.error(
    "[db] conexion inactiva perdida (el pool la descarta y abre otra):",
    error instanceof Error ? error.message : error,
  );

  // `client` puede venir undefined si el fallo ocurrio al conectar.
  if (client) {
    // `release(true)` marca la conexion como rota para que no vuelva al pool.
    try {
      client.release(true);
    } catch {
      // Ya estaba liberada; no hay nada que hacer y no debe propagarse.
    }
  }
});

/**
 * Comprueba que el pool responde. Lo usa `/ready`.
 *
 * Deliberadamente no reintenta: si falla, el pod no debe recibir trafico, y esa
 * decision es de Kubernetes, no de aqui.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export type Db = pg.PoolClient;

/** Pool y PoolClient comparten `query`; los helpers de solo lectura aceptan ambos. */
export type Queryable = Pick<pg.PoolClient, "query">;

/**
 * Ejecuta `fn` dentro de una transaccion; si lanza, hace ROLLBACK.
 *
 * Todo lo que combina "cambiar estado" con "encolar trabajo on-chain" pasa por
 * aqui. Es lo unico que garantiza que una orden pagada y su voucher pendiente
 * aparezcan juntos, o no aparezca ninguno.
 */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Violacion de restriccion unica en Postgres. */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string };
  if (e?.code !== UNIQUE_VIOLATION) return false;
  return constraint ? e.constraint === constraint : true;
}
