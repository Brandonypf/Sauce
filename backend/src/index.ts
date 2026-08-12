import { buildApp } from "./app.js";
import { pool } from "./db.js";
import { env } from "./env.js";
import { migrate } from "./lib/migrate.js";

const app = await buildApp();

// Migrar al arrancar es seguro con varias replicas: `migrate` toma un bloqueo
// consultivo, asi que la primera migra y las demas esperan y siguen.
const applied = await migrate();
if (applied.length) app.log.info(`Migraciones aplicadas: ${applied.join(", ")}`);

await app.listen({ port: env.PORT, host: env.HOST });

// SIGTERM es como Kubernetes pide que un pod termine. Cerrar el servidor antes que
// el pool deja que las peticiones en vuelo acaben en vez de cortarse a la mitad.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} recibido, cerrando`);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
