import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const migrationsDir = join(process.cwd(), "migrations");
/**
 * Aplica las migraciones pendientes.
 *
 * El bloqueo consultivo es lo que hace seguro que N replicas arranquen a la vez:
 * la primera migra, las demas esperan y encuentran que ya no hay nada que hacer.
 * Sin el, dos pods ejecutando `CREATE TABLE` simultaneamente hacen que uno se
 * caiga en bucle.
 */
export async function migrate(): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('sauce_migrations'))");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const { rowCount } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rowCount) continue;

      const sql = await readFile(join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('sauce_migrations'))");
    client.release();
  }

  return applied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const applied = await migrate();
  console.log(applied.length ? `Aplicadas: ${applied.join(", ")}` : "Sin migraciones pendientes");
  await pool.end();
}
