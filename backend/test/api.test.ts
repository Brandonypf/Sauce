import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { after, before, describe, test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const testUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/sauce_test";

// Estas pruebas escriben y borran datos. Si DATABASE_URL apuntara a Supabase,
// tocarian la base compartida del equipo.
if (/supabase|pooler\.supabase|amazonaws/i.test(testUrl)) {
  throw new Error("Las pruebas NO pueden correr contra una base remota.");
}

process.env.DATABASE_URL = testUrl;
process.env.ISSUER_PRIVATE_KEY ??=
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.LICENSE_NFT_ADDRESS ??= "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
process.env.CHAIN_ID ??= "31337";
process.env.GATEWAY_WEBHOOK_SECRET ??= "dev-secret";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./storage-test-api";

const { pool } = await import("../src/db.js");
const { migrate } = await import("../src/lib/migrate.js");
const { buildApp } = await import("../src/app.js");
const { buildSiweMessage } = await import("../src/lib/session.js");

const app = await buildApp();

// Cuentas nuevas en cada ejecucion. Con cuentas fijas la segunda corrida choca
// con "esta wallet ya tiene un perfil de creador", y la suite solo pasaria contra
// una base recien creada.
const buyer = privateKeyToAccount(generatePrivateKey());
const creator = privateKeyToAccount(generatePrivateKey());

before(async () => {
  await migrate();
});

after(async () => {
  await app.close();
  await pool.end();
  await rm("./storage-test-api", { recursive: true, force: true });
});

/** Inicia sesion firmando el nonce, y devuelve la cookie de sesion. */
async function login(account: typeof buyer): Promise<string> {
  const nonceRes = await app.inject({ method: "GET", url: "/api/auth/nonce" });
  const { nonce } = nonceRes.json();

  const signature = await account.signMessage({
    message: buildSiweMessage(account.address, nonce, "SAUCE"),
  });

  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    payload: { address: account.address, nonce, signature },
  });

  assert.equal(verify.statusCode, 200, `login fallo: ${verify.body}`);

  const cookie = verify.cookies.find((c) => c.name === "sauce_session");
  assert.ok(cookie, "debe emitirse cookie de sesion");

  return `sauce_session=${cookie.value}`;
}

/** Recorre los tres pasos de subida y devuelve el uploadId ya verificado. */
async function uploadFile(cookie: string, file: Buffer): Promise<string> {
  const checksum = createHash("sha256").update(file).digest("hex");

  const created = await app.inject({
    method: "POST",
    url: "/api/uploads",
    headers: { cookie },
    payload: {
      filename: "obra.zip",
      mimeType: "application/zip",
      sizeBytes: file.length,
      checksum,
      purpose: "content",
    },
  });

  const { uploadId, upload } = created.json();

  await app.inject({
    method: "PUT",
    url: upload.url.replace("http://localhost:4000", ""),
    payload: file,
  });

  await app.inject({
    method: "POST",
    url: `/api/uploads/${uploadId}/complete`,
    headers: { cookie },
    payload: { checksum },
  });

  return uploadId;
}

function sign(payload: unknown): string {
  return createHmac("sha256", "dev-secret").update(JSON.stringify(payload)).digest("hex");
}

describe("flujo completo por HTTP", () => {
  test("publicar, comprar, cobrar webhook, obtener voucher y acceder", async () => {
    const creatorCookie = await login(creator);
    const buyerCookie = await login(buyer);

    // --- el creador se registra y publica
    const handle = `estudio${Date.now() % 1_000_000}`;

    const reg = await app.inject({
      method: "POST",
      url: "/api/creators",
      headers: { cookie: creatorCookie },
      payload: { handle, name: "Estudio Prueba", bio: "Visual novels" },
    });
    assert.equal(reg.statusCode, 200, reg.body);

    // Publicar exige una subida completada: el contentHash sale del archivo
    // verificado, no de un valor que declare el cliente.
    const uploadId = await uploadFile(creatorCookie, Buffer.from(`vn-${randomUUID()}`));

    const pub = await app.inject({
      method: "POST",
      url: "/api/works",
      headers: { cookie: creatorCookie },
      payload: {
        title: "Hoshizora no Kanata",
        description: "Novela visual",
        category: "game",
        coverUrl: "https://picsum.photos/seed/x/600/800",
        uploadId,
        priceMinor: 3800,
        priceCurrency: "PEN",
      },
    });
    assert.equal(pub.statusCode, 200, pub.body);
    const slug = pub.json().work.slug as string;

    // Publicar dos veces el mismo archivo se rechaza antes de tocar la cadena.
    const dup = await app.inject({
      method: "POST",
      url: "/api/works",
      headers: { cookie: creatorCookie },
      payload: {
        title: "Otro titulo",
        category: "game",
        uploadId,
        priceMinor: 3800,
      },
    });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.json().error, "duplicate_content");

    // El relayer confirma el registro on-chain y escribe el contentId. Hasta que
    // eso pasa se puede comprar igual, pero el voucher se encola en vez de
    // firmarse; aqui se simula la confirmacion para cubrir el camino completo.
    await pool.query("UPDATE works SET content_id = $2 WHERE lower(slug) = lower($1)", [
      slug,
      Date.now() % 100_000_000,
    ]);

    // --- aparece en el catalogo publico
    const list = await app.inject({ method: "GET", url: "/api/works" });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().works.some((w: { slug: string }) => w.slug === slug));

    // --- el contenido no se entrega sin licencia
    const denied = await app.inject({
      method: "POST",
      url: `/api/works/${slug}/access`,
      headers: { cookie: buyerCookie },
    });
    assert.equal(denied.statusCode, 403, "sin licencia no hay bytes");

    // --- checkout
    const key = randomUUID();
    const checkout = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: { cookie: buyerCookie },
      payload: { slug, idempotencyKey: key },
    });
    assert.equal(checkout.statusCode, 200, checkout.body);

    const orderId = checkout.json().orderId as string;
    assert.ok(checkout.json().usdcAmount > 0, "el tipo de cambio se congela al abrir el checkout");

    // Doble clic: misma clave, misma orden.
    const again = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: { cookie: buyerCookie },
      payload: { slug, idempotencyKey: key },
    });
    assert.equal(again.json().orderId, orderId);
    assert.equal(again.json().deduplicated, true);

    // --- webhook de la pasarela
    const event = { id: `evt_${randomUUID()}`, type: "payment.succeeded", data: { orderId } };

    const bad = await app.inject({
      method: "POST",
      url: "/api/webhooks/mock",
      headers: { "x-sauce-signature": "no" },
      payload: event,
    });
    assert.equal(bad.statusCode, 400, "una firma invalida no cumple la orden");

    const hook = await app.inject({
      method: "POST",
      url: "/api/webhooks/mock",
      headers: { "x-sauce-signature": sign(event) },
      payload: event,
    });
    assert.equal(hook.statusCode, 200, hook.body);
    assert.equal(hook.json().alreadyProcessed, false);

    const replay = await app.inject({
      method: "POST",
      url: "/api/webhooks/mock",
      headers: { "x-sauce-signature": sign(event) },
      payload: event,
    });
    assert.equal(replay.json().alreadyProcessed, true, "reentrega = sin efecto");

    // --- la orden trae un voucher firmado
    const order = await app.inject({
      method: "GET",
      url: `/api/orders/${orderId}`,
      headers: { cookie: buyerCookie },
    });
    assert.equal(order.json().order.status, "paid");

    const voucher = order.json().voucher;
    assert.ok(voucher, "debe existir voucher");
    assert.match(voucher.signature, /^0x[0-9a-f]{130}$/, "firma de 65 bytes");
    assert.equal(voucher.to.toLowerCase(), buyer.address.toLowerCase());

    // --- ahora si hay acceso
    const access = await app.inject({
      method: "POST",
      url: `/api/works/${slug}/access`,
      headers: { cookie: buyerCookie },
    });
    assert.equal(access.statusCode, 200, "con licencia se entrega URL firmada");
    assert.ok(access.json().expiresAt > Math.floor(Date.now() / 1000), "la URL caduca");

    // --- y aparece en la biblioteca
    const library = await app.inject({
      method: "GET",
      url: "/api/library",
      headers: { cookie: buyerCookie },
    });
    const owned = library.json().items.find((i: { slug: string }) => i.slug === slug);
    assert.ok(owned, "la obra esta en la biblioteca");
    assert.equal(owned.onchainClaimed, false, "todavia no canjeo el recibo on-chain");

    // --- comprar dos veces la misma obra
    const twice = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: { cookie: buyerCookie },
      payload: { slug, idempotencyKey: randomUUID() },
    });
    assert.equal(twice.statusCode, 409);
    assert.equal(twice.json().error, "already_owned");
  });

  test("sin sesion no se ve la biblioteca", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library" });
    assert.equal(res.statusCode, 401);
  });

  test("una firma que no corresponde a la direccion se rechaza", async () => {
    const nonceRes = await app.inject({ method: "GET", url: "/api/auth/nonce" });
    const { nonce } = nonceRes.json();

    const signature = await buyer.signMessage({
      message: buildSiweMessage(buyer.address, nonce, "SAUCE"),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: { address: creator.address, nonce, signature },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "bad_signature");
  });

  test("health y ready responden", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/ready" })).statusCode, 200);
  });
});
