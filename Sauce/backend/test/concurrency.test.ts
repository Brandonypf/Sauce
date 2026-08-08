import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/sauce_test";
process.env.ISSUER_PRIVATE_KEY ??=
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.LICENSE_NFT_ADDRESS ??= "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
process.env.CHAIN_ID ??= "31337";

const { pool, tx, isUniqueViolation } = await import("../src/db.js");
const { migrate } = await import("../src/lib/migrate.js");
const { fulfillOrder } = await import("../src/lib/fulfillment.js");

/**
 * Estas pruebas existen por la pregunta sobre Kubernetes.
 *
 * Cada una lanza N operaciones en paralelo, como harian N replicas de la API
 * recibiendo peticiones simultaneas, y comprueba que la base de datos deja pasar
 * exactamente una. Si estas garantias vivieran en el codigo de la aplicacion
 * (comprobar y luego insertar), todas fallarian en cuanto hay mas de un proceso.
 */

// Sin TRUNCATE a proposito. Cada prueba genera sus propios identificadores
// unicos, asi que las suites pueden correr en paralelo y en cualquier orden — que
// es exactamente la propiedad que se le exige al codigo que estan probando.
before(async () => {
  await migrate();
});

after(async () => {
  await pool.end();
});

async function makeUser(): Promise<string> {
  // Un uuid sin guiones son 32 caracteres hex; una direccion necesita 40.
  const wallet = `0x${(randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 40)}`;
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO users (wallet) VALUES ($1) RETURNING id",
    [wallet],
  );
  return rows[0]!.id;
}

/** Hash de contenido unico por ejecucion: sin TRUNCATE, los fijos chocarian. */
function contentHash(): string {
  return `0x${(randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64)}`;
}

function settled<T>(results: PromiseSettledResult<T>[]) {
  return {
    ok: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected"),
  };
}

describe("registro concurrente de creadores", () => {
  test("veinte cuentas pidiendo el mismo handle: solo una gana", async () => {
    const handle = `nekomori_${Date.now()}`;
    const users = await Promise.all(Array.from({ length: 20 }, makeUser));

    const results = await Promise.allSettled(
      users.map((userId) =>
        pool.query(
          `INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, $3) RETURNING id`,
          [userId, handle, "Colision"],
        ),
      ),
    );

    const { ok, failed } = settled(results);

    assert.equal(ok, 1, "exactamente un registro debe tener exito");
    assert.equal(failed.length, 19);

    // Y el resto falla por la razon correcta, no por un deadlock ni un timeout.
    for (const f of failed) {
      assert.ok(
        isUniqueViolation(f.reason, "creators_handle_key"),
        `esperaba violacion de unicidad, llego: ${f.reason}`,
      );
    }

    const { rows } = await pool.query("SELECT count(*) FROM creators WHERE lower(handle) = $1", [
      handle,
    ]);
    assert.equal(Number(rows[0]!.count), 1);
  });

  test("la misma wallet no puede tener dos perfiles de creador", async () => {
    const userId = await makeUser();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        pool.query(`INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, $3)`, [
          userId,
          `dup_${Date.now()}_${i}`,
          "Dup",
        ]),
      ),
    );

    assert.equal(settled(results).ok, 1);
  });
});

describe("publicacion concurrente de obras", () => {
  test("el mismo archivo subido a la vez se publica una sola vez", async () => {
    const userId = await makeUser();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, $3) RETURNING id`,
      [userId, `pub_${Date.now()}`, "Publicador"],
    );

    const creatorId = rows[0]!.id;
    const hash = contentHash();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        pool.query(
          `INSERT INTO works (creator_id, slug, title, category, content_hash, price_minor)
           VALUES ($1, $2, $3, 'game', $4, 3800)`,
          [creatorId, `obra-${Date.now()}-${i}`, "Misma obra", hash],
        ),
      ),
    );

    const { ok, failed } = settled(results);

    assert.equal(ok, 1, "el hash de contenido es unico");
    for (const f of failed) {
      assert.ok(isUniqueViolation(f.reason, "works_content_hash_key"));
    }
  });
});

describe("webhooks duplicados", () => {
  test("cinco entregas del mismo evento producen una licencia", async () => {
    const buyerId = await makeUser();
    const creatorUser = await makeUser();

    const creator = await pool.query<{ id: string }>(
      `INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, $3) RETURNING id`,
      [creatorUser, `wh_${Date.now()}`, "Creador"],
    );

    const work = await pool.query<{ id: string }>(
      `INSERT INTO works (creator_id, slug, title, category, content_hash, price_minor, content_id, status, published_at)
       VALUES ($1, $2, 'Obra webhook', 'game', $3, 3800, $4, 'published', now())
       RETURNING id`,
      [creator.rows[0]!.id, `wh-obra-${Date.now()}`, contentHash(), Date.now() % 100_000_000],
    );

    const order = await pool.query<{ id: string }>(
      `INSERT INTO orders
         (user_id, work_id, currency, amount_minor, fx_rate, fx_locked_at, usdc_amount,
          gateway, idempotency_key)
       VALUES ($1, $2, 'PEN', 3800, 0.27, now(), 10260, 'mock', $3)
       RETURNING id`,
      [buyerId, work.rows[0]!.id, randomUUID()],
    );

    const orderId = order.rows[0]!.id;
    const eventId = `evt_${randomUUID()}`;

    // La pasarela entrega el mismo evento cinco veces, a la vez.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        tx((db) =>
          fulfillOrder(db, {
            provider: "mock",
            eventId,
            orderId,
            payload: { id: eventId },
          }),
        ),
      ),
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fulfillOrder>>> =>
        r.status === "fulfilled",
    );

    const processed = fulfilled.filter((r) => !r.value.alreadyProcessed);
    assert.equal(processed.length, 1, "solo una entrega hace trabajo real");

    const entitlements = await pool.query(
      "SELECT count(*) FROM entitlements WHERE user_id = $1 AND work_id = $2",
      [buyerId, work.rows[0]!.id],
    );
    assert.equal(Number(entitlements.rows[0]!.count), 1, "una sola licencia");

    const vouchers = await pool.query("SELECT count(*) FROM vouchers WHERE order_id = $1", [orderId]);
    assert.equal(Number(vouchers.rows[0]!.count), 1, "un solo voucher");

    const outbox = await pool.query(
      "SELECT count(*) FROM outbox WHERE payload->>'orderId' = $1",
      [orderId],
    );
    assert.equal(Number(outbox.rows[0]!.count), 1, "un solo trabajo encolado");

    const status = await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]);
    assert.equal(status.rows[0]!.status, "paid");
  });
});

describe("checkout con doble clic", () => {
  test("la misma clave de idempotencia crea una sola orden", async () => {
    const buyerId = await makeUser();
    const creatorUser = await makeUser();

    const creator = await pool.query<{ id: string }>(
      `INSERT INTO creators (user_id, handle, name) VALUES ($1, $2, $3) RETURNING id`,
      [creatorUser, `idem_${Date.now()}`, "Creador"],
    );

    const work = await pool.query<{ id: string }>(
      `INSERT INTO works (creator_id, slug, title, category, content_hash, price_minor, status, published_at)
       VALUES ($1, $2, 'Obra idem', 'game', $3, 3800, 'published', now())
       RETURNING id`,
      [creator.rows[0]!.id, `idem-obra-${Date.now()}`, contentHash()],
    );

    const key = randomUUID();

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        pool.query(
          `INSERT INTO orders
             (user_id, work_id, currency, amount_minor, fx_rate, fx_locked_at,
              usdc_amount, gateway, idempotency_key)
           VALUES ($1, $2, 'PEN', 3800, 0.27, now(), 10260, 'mock', $3)`,
          [buyerId, work.rows[0]!.id, key],
        ),
      ),
    );

    assert.equal(settled(results).ok, 1);
  });
});

describe("bloqueo del relayer", () => {
  test("solo un proceso puede tomar el bloqueo consultivo", async () => {
    const LOCK = 918_273_645;

    const a = await pool.connect();
    const b = await pool.connect();

    try {
      const first = await a.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [
        LOCK,
      ]);
      const second = await b.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [LOCK],
      );

      assert.equal(first.rows[0]!.locked, true, "el primero toma el bloqueo");
      assert.equal(
        second.rows[0]!.locked,
        false,
        "el segundo no: es lo que impide que dos relayers compitan por el nonce",
      );
    } finally {
      await a.query("SELECT pg_advisory_unlock($1)", [LOCK]);
      a.release();
      b.release();
    }
  });
});
