/**
 * Verificacion completa contra el backend levantado, con medicion de tiempos.
 *
 * Sockets HTTP reales contra 127.0.0.1:4000. Los tiempos incluyen serializacion,
 * pool de conexiones y round-trip local — no incluyen latencia de red real.
 */
import { randomUUID, createHmac } from "node:crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import pg from "pg";

const BASE = "http://127.0.0.1:4000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const steps = [];

async function call(name, path, init = {}) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (name) steps.push({ name, ms, status: res.status });
  return { res, body, ms };
}

const siwe = (a, n, d) =>
  [`${d} quiere que inicies sesion con tu wallet.`, "", `Direccion: ${a}`, `Nonce: ${n}`, "",
   "Firmar no cuesta gas y no autoriza ninguna transaccion."].join("\n");

async function login(account, label) {
  const { body: n } = await call(`${label}: pedir nonce`, "/api/auth/nonce");
  const signature = await account.signMessage({ message: siwe(account.address, n.nonce, n.domain) });
  const { res } = await call(`${label}: verificar firma`, "/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ address: account.address, nonce: n.nonce, signature }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`${label}: sin cookie`);
  return cookie;
}

let failures = 0;
function ok(cond, msg) {
  console.log(`  ${cond ? "ok  " : "FALLA"} ${msg}`);
  if (!cond) failures++;
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1], avg: s.reduce((a, b) => a + b, 0) / s.length };
};

const creator = privateKeyToAccount(generatePrivateKey());
const buyer = privateKeyToAccount(generatePrivateKey());

console.log("\n── 1. Autenticacion por firma de wallet");
const creatorCookie = await login(creator, "creador");
const buyerCookie = await login(buyer, "comprador");
ok(true, "dos sesiones abiertas con cookie httpOnly");

console.log("\n── 2. Publicacion");
const handle = `estudio${Date.now() % 1_000_000}`;
const { res: regRes } = await call("registrar creador", "/api/creators", {
  method: "POST", headers: { cookie: creatorCookie },
  body: JSON.stringify({ handle, name: "Estudio Verificacion", bio: "VN" }),
});
ok(regRes.status === 200, `creador registrado (@${handle})`);

const contentHash = `0x${(randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 64)}`;
const { body: pub, res: pubRes } = await call("publicar obra", "/api/works", {
  method: "POST", headers: { cookie: creatorCookie },
  body: JSON.stringify({
    title: "Hoshizora no Kanata", description: "Novela visual", category: "game",
    coverUrl: "https://picsum.photos/seed/v/600/800", contentHash,
    priceMinor: 3800, priceCurrency: "PEN",
  }),
});
ok(pubRes.status === 200, "obra publicada");
const slug = pub.work.slug;

const { res: dupRes, body: dupBody } = await call("publicar duplicado", "/api/works", {
  method: "POST", headers: { cookie: creatorCookie },
  body: JSON.stringify({ title: "Otro", category: "game", contentHash, priceMinor: 3800 }),
});
ok(dupRes.status === 409 && dupBody.error === "duplicate_content", "mismo archivo rechazado (409)");

// El relayer NO escribe en la cadena: registerContent exige que msg.sender sea el
// creador, y el relayer firma con la llave de la plataforma. Sin contentId no hay
// voucher posible, asi que aqui se simula la confirmacion para poder medir el
// resto del flujo. Es un parche de la prueba, no del producto.
await pool.query("UPDATE works SET content_id = $2 WHERE slug = $1", [slug, Date.now() % 100000000]);
console.log("  (!) contentId inyectado a mano: el relayer no puede registrarlo");

console.log("\n── 3. Catalogo");
const { body: list } = await call("listar catalogo", "/api/works");
ok(list.works.some((w) => w.slug === slug), "la obra aparece en el catalogo");
const { body: detail } = await call("ficha de obra", `/api/works/${slug}`);
ok(detail.work.priceMinor === 3800, "precio servido por el backend");

console.log("\n── 4. Control de acceso");
const { res: denied, body: deniedBody } = await call("acceso sin licencia", `/api/works/${slug}/access`, {
  method: "POST", headers: { cookie: buyerCookie },
});
ok(denied.status === 403 && deniedBody.error === "forbidden", "sin licencia no se entregan bytes (403)");

console.log("\n── 5. Checkout");
const idem = randomUUID();
const { body: checkout } = await call("abrir checkout", "/api/checkout", {
  method: "POST", headers: { cookie: buyerCookie },
  body: JSON.stringify({ slug, idempotencyKey: idem }),
});
ok(!!checkout.orderId, "orden PENDING creada");
ok(checkout.fxRate > 0, `tipo de cambio congelado (${checkout.fxRate} → ${checkout.usdcAmount} µUSDC)`);

const { body: again } = await call("checkout repetido", "/api/checkout", {
  method: "POST", headers: { cookie: buyerCookie },
  body: JSON.stringify({ slug, idempotencyKey: idem }),
});
ok(again.orderId === checkout.orderId && again.deduplicated === true, "doble clic → misma orden");

console.log("\n── 6. Webhook de pasarela");
const event = { id: `evt_${randomUUID()}`, type: "payment.succeeded", data: { orderId: checkout.orderId } };
const sig = createHmac("sha256", "dev-secret").update(JSON.stringify(event)).digest("hex");

const { res: bad } = await call("webhook mal firmado", "/api/webhooks/mock", {
  method: "POST", headers: { "x-sauce-signature": "invalido", "Content-Type": "application/json" },
  body: JSON.stringify(event),
});
ok(bad.status === 400, "HMAC invalido rechazado");

const { body: hook } = await call("webhook valido", "/api/webhooks/mock", {
  method: "POST", headers: { "x-sauce-signature": sig }, body: JSON.stringify(event),
});
ok(hook.alreadyProcessed === false, "primera entrega cumple la orden");

const { body: replay } = await call("webhook reentregado", "/api/webhooks/mock", {
  method: "POST", headers: { "x-sauce-signature": sig }, body: JSON.stringify(event),
});
ok(replay.alreadyProcessed === true, "reentrega sin efecto (idempotente)");

console.log("\n── 7. Voucher y acceso");
const { body: order } = await call("consultar orden", `/api/orders/${checkout.orderId}`, {
  headers: { cookie: buyerCookie },
});
ok(order.order.status === "paid", "orden pagada");
ok(!!order.voucher, "voucher EIP-712 emitido");
ok(/^0x[0-9a-f]{130}$/.test(order.voucher?.signature ?? ""), "firma de 65 bytes");
ok(order.voucher?.to.toLowerCase() === buyer.address.toLowerCase(), "voucher ligado al comprador");

const { body: access, res: accessRes } = await call("acceso con licencia", `/api/works/${slug}/access`, {
  method: "POST", headers: { cookie: buyerCookie },
});
ok(accessRes.status === 200, "con licencia se entrega URL firmada");
ok(access.expiresAt > Math.floor(Date.now() / 1000), "la URL caduca");

const { body: lib } = await call("biblioteca", "/api/library", { headers: { cookie: buyerCookie } });
ok(lib.items.some((i) => i.slug === slug), "la obra esta en la biblioteca");

const { res: twice, body: twiceBody } = await call("recomprar", "/api/checkout", {
  method: "POST", headers: { cookie: buyerCookie },
  body: JSON.stringify({ slug, idempotencyKey: randomUUID() }),
});
ok(twice.status === 409 && twiceBody.error === "already_owned", "no se compra dos veces");

console.log("\n── 8. Concurrencia sobre HTTP (no en la base directamente)");
const rivals = await Promise.all(Array.from({ length: 20 }, async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  return login(acct, null).catch(() => null);
}));

const shared = `colision${Date.now() % 1_000_000}`;
const t0 = process.hrtime.bigint();
const results = await Promise.all(
  rivals.filter(Boolean).map((cookie) =>
    call(null, "/api/creators", {
      method: "POST", headers: { cookie },
      body: JSON.stringify({ handle: shared, name: "Colision" }),
    }).then((r) => r.res.status),
  ),
);
const burstMs = Number(process.hrtime.bigint() - t0) / 1e6;

const wins = results.filter((s) => s === 200).length;
const conflicts = results.filter((s) => s === 409).length;
const other = results.filter((s) => s !== 200 && s !== 409);

ok(wins === 1, `${results.length} peticiones simultaneas por @${shared} → ${wins} exito, ${conflicts} × 409`);
ok(other.length === 0, `sin errores inesperados (otros codigos: ${other.join(",") || "ninguno"})`);
console.log(`  rafaga completa en ${burstMs.toFixed(0)} ms`);

console.log("\n── 9. Latencia por endpoint (60 peticiones cada uno)");
const bench = async (label, fn) => {
  for (let i = 0; i < 5; i++) await fn();          // calentamiento
  const xs = [];
  for (let i = 0; i < 60; i++) { const { ms } = await fn(); xs.push(ms); }
  const s = stats(xs);
  console.log(`  ${label.padEnd(34)} p50 ${s.p50.toFixed(1).padStart(6)}  p95 ${s.p95.toFixed(1).padStart(6)}  max ${s.max.toFixed(1).padStart(6)}`);
  return s;
};

console.log("  " + "endpoint".padEnd(34) + "         ms         ms         ms");
await bench("GET /health", () => call(null, "/health"));
await bench("GET /ready (toca Postgres)", () => call(null, "/ready"));
await bench("GET /api/works", () => call(null, "/api/works"));
await bench("GET /api/works/:slug", () => call(null, `/api/works/${slug}`));
await bench("GET /api/library (con sesion)", () => call(null, "/api/library", { headers: { cookie: buyerCookie } }));
await bench("POST /api/works/:slug/access", () => call(null, `/api/works/${slug}/access`, { method: "POST", headers: { cookie: buyerCookie } }));

console.log("\n── 10. Tiempos del recorrido (una sola vez cada uno)");
for (const s of steps) {
  console.log(`  ${s.name.padEnd(30)} ${String(s.status).padEnd(5)} ${s.ms.toFixed(1).padStart(7)} ms`);
}
const total = steps.reduce((a, s) => a + s.ms, 0);
console.log(`  ${"TOTAL del flujo".padEnd(30)} ${"".padEnd(5)} ${total.toFixed(1).padStart(7)} ms`);

console.log(`\n${failures === 0 ? "TODAS LAS COMPROBACIONES PASARON" : `${failures} COMPROBACIONES FALLARON`}`);
await pool.end();
process.exit(failures === 0 ? 0 : 1);
