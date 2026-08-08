import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

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
