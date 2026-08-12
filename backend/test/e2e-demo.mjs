/**
 * Recorrido completo por HTTP real contra el backend levantado.
 *
 * Sigue exactamente el flujo que pide la demo: creador publica, comprador se
 * registra SIN wallet, compra desde el catálogo, y llega al contenido.
 *
 * Comprueba también lo que NO debe pasar: que alguien sin licencia no reciba
 * jamás la URL del archivo.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000";

let ok = 0;
let bad = 0;

function check(cond, label) {
  console.log(`  ${cond ? "ok   " : "FALLA"} ${label}`);
  cond ? ok++ : bad++;
}

function cookieOf(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).find((c) => c.startsWith("sauce_session=")) ?? "";
}

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return { res, json: await res.json().catch(() => null) };
}

const PASSWORD = "una-frase-larga-y-seguraa";
const nuevoEmail = () => `e2e-${randomUUID().slice(0, 8)}@sauce.test`;

async function registrar() {
  const email = nuevoEmail();
  const { res, json } = await call("POST", "/api/auth/register", {
    body: { email, password: PASSWORD },
  });

  assert.equal(res.statusCode ?? res.status, 200, JSON.stringify(json));
  return { email, cookie: cookieOf(res) };
}

// ══════════════════════════════════════ CREADOR

console.log("\n━━ CREADOR");

const creador = await registrar();
check(Boolean(creador.cookie), "1. cuenta creada sin wallet");

const handle = `estudio${Date.now() % 1_000_000}`;
const perfil = await call("POST", "/api/creators", {
  cookie: creador.cookie,
  body: { handle, name: "Estudio E2E", bio: "Novelas visuales" },
});
check(perfil.res.status === 200, "2. perfil de creador creado");

// --- subida del archivo (los tres pasos)
const archivo = Buffer.from(`%PDF-1.4 obra de prueba ${randomUUID()}`.repeat(40));
const checksum = createHash("sha256").update(archivo).digest("hex");

const reserva = await call("POST", "/api/uploads", {
  cookie: creador.cookie,
  body: {
    filename: "obra.pdf",
    mimeType: "application/pdf",
    sizeBytes: archivo.length,
    checksum,
    purpose: "content",
  },
});
check(reserva.res.status === 200, "3. subida reservada");
check(Boolean(reserva.json?.upload?.url), "   devuelve URL prefirmada");

const putRes = await fetch(reserva.json.upload.url, { method: "PUT", body: archivo });
check(putRes.ok, "4. archivo subido al almacenamiento");

const cierre = await call("POST", `/api/uploads/${reserva.json.uploadId}/complete`, {
  cookie: creador.cookie,
  body: { checksum },
});
check(cierre.res.status === 200, "5. subida verificada por el servidor");
check(cierre.json?.sizeBytes === archivo.length, "   el tamaño coincide");

const publicada = await call("POST", "/api/works", {
  cookie: creador.cookie,
  body: {
    title: `Hoshizora ${Date.now() % 10000}`,
    description: "Novela visual de prueba E2E",
    category: "visual_novel",
    uploadId: reserva.json.uploadId,
    priceMinor: 3800,
    priceCurrency: "PEN",
  },
});
check(publicada.res.status === 200, "6. obra publicada");

const slug = publicada.json?.work?.slug;
check(Boolean(slug), `   slug: ${slug}`);

// ── BUG #1: el formato elegido debe conservarse, no volverse "game"
const fichaFormato = await call("GET", `/api/works/${publicada.json.work.slug}`);
check(
  fichaFormato.json?.work?.format === "visual_novel",
  `6b. el formato se conserva (fue "${fichaFormato.json?.work?.format}")`,
);

// Una obra de cada formato, para el filtro
async function publicarFormato(formato, precio) {
  const bytes = Buffer.from(`${formato}-${randomUUID()}`.repeat(30));
  const sum = createHash("sha256").update(bytes).digest("hex");

  const r = await call("POST", "/api/uploads", {
    cookie: creador.cookie,
    body: { filename: `${formato}.pdf`, mimeType: "application/pdf", sizeBytes: bytes.length, checksum: sum, purpose: "content" },
  });

  await fetch(r.json.upload.url, { method: "PUT", body: bytes });
  await call("POST", `/api/uploads/${r.json.uploadId}/complete`, { cookie: creador.cookie, body: { checksum: sum } });

  const w = await call("POST", "/api/works", {
    cookie: creador.cookie,
    body: { title: `${formato} ${Date.now() % 100000}`, category: formato, uploadId: r.json.uploadId, priceMinor: precio },
  });

  return w.json?.work;
}

const obraManga = await publicarFormato("manga", 2500);
const obraJuego = await publicarFormato("game", 0);

check(obraManga?.format === "manga", "6c. manga se guarda como manga");
check(obraJuego?.format === "game", "6d. game se guarda como game");

async function publicarConPortada(coverUploadId) {
  const bytes = Buffer.from(`con-portada-${randomUUID()}`.repeat(30));
  const sum = createHash("sha256").update(bytes).digest("hex");

  const r = await call("POST", "/api/uploads", {
    cookie: creador.cookie,
    body: {
      filename: "obra2.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      checksum: sum,
      purpose: "content",
    },
  });

  await fetch(r.json.upload.url, { method: "PUT", body: bytes });
  await call("POST", `/api/uploads/${r.json.uploadId}/complete`, {
    cookie: creador.cookie,
    body: { checksum: sum },
  });

  const w = await call("POST", "/api/works", {
    cookie: creador.cookie,
    body: {
      title: `Con portada ${Date.now() % 100000}`,
      category: "manga",
      uploadId: r.json.uploadId,
      coverUploadId,
      priceMinor: 1500,
    },
  });

  return w.json?.work;
}

// ══════════════════════════════════════ CATÁLOGO

console.log("\n━━ CATÁLOGO (lo que ve Home y Explore)");

const catalogo = await call("GET", "/api/works");
check(
  catalogo.json?.works?.some((w) => w.slug === slug),
  "7. la obra aparece en GET /api/works",
);

const ficha = await call("GET", `/api/works/${slug}`);
check(ficha.res.status === 200, "8. la ficha responde (ruta /work/:slug)");
check(ficha.json?.work?.priceMinor === 3800, "   con el precio correcto");

// ── BUG #2: el filtro por formato debe filtrar de verdad
const soloManga = await call("GET", "/api/works?format=manga");
check(
  soloManga.json?.works?.every((w) => w.format === "manga"),
  "8b. format=manga devuelve SOLO manga",
);
check(
  soloManga.json?.works?.some((w) => w.slug === obraManga.slug),
  "   e incluye la obra de manga publicada",
);

const soloVN = await call("GET", "/api/works?format=visual_novel");
check(
  soloVN.json?.works?.every((w) => w.format === "visual_novel"),
  "8c. format=visual_novel devuelve SOLO novelas visuales",
);
check(
  !soloVN.json?.works?.some((w) => w.slug === obraManga.slug),
  "   y excluye el manga",
);

const sinFiltro = await call("GET", "/api/works");
check(
  (sinFiltro.json?.works?.length ?? 0) > (soloManga.json?.works?.length ?? 0),
  "8d. sin filtro devuelve mas que con filtro",
);

// ══════════════════════════════════════ COMPRADOR

console.log("\n━━ COMPRADOR (sin wallet)");

const comprador = await registrar();

const me = await call("GET", "/api/auth/me", { cookie: comprador.cookie });
check(me.json?.wallet === null, "9. comprador autenticado SIN wallet");

const sinLicencia = await call("POST", `/api/works/${slug}/access`, {
  cookie: comprador.cookie,
});
check(sinLicencia.res.status === 403, "10. sin licencia NO se entrega el archivo (403)");

const antes = await call("GET", `/api/works/${slug}`, { cookie: comprador.cookie });
check(antes.json?.work?.owned === false, "11. la ficha dice owned:false");

const checkout = await call("POST", "/api/checkout", {
  cookie: comprador.cookie,
  body: { slug, idempotencyKey: randomUUID() },
});
check(checkout.res.status === 200, "12. checkout crea la orden");
check(checkout.json?.fxRate > 0, `   tipo de cambio congelado (${checkout.json?.fxRate})`);

const pago = await call("POST", `/api/dev/pay/${checkout.json.orderId}`, {
  cookie: comprador.cookie,
});
check(pago.res.status === 200, "13. pago simulado procesado");
check(pago.json?.alreadyProcessed === false, "   la orden se cumplió");

const orden = await call("GET", `/api/orders/${checkout.json.orderId}`, {
  cookie: comprador.cookie,
});
check(orden.json?.order?.status === "paid", "14. orden en estado PAID");

// El comprador no tiene wallet, así que NO debe haber voucher: no hay dirección
// a la que emitirlo. El acceso al contenido no depende de esto.
check(orden.json?.voucher === null, "15. sin wallet no se emite voucher (correcto)");

const biblioteca = await call("GET", "/api/library", { cookie: comprador.cookie });
check(
  biblioteca.json?.items?.some((i) => i.slug === slug),
  "16. la obra aparece en la biblioteca",
);

const despues = await call("GET", `/api/works/${slug}`, { cookie: comprador.cookie });
check(despues.json?.work?.owned === true, "17. la ficha ahora dice owned:true");

const acceso = await call("POST", `/api/works/${slug}/access`, { cookie: comprador.cookie });
check(acceso.res.status === 200, "18. con licencia se entrega URL firmada");
check(acceso.json?.expiresAt > Math.floor(Date.now() / 1000), "   la URL caduca");

// ══════════════════════════════════════ READER

console.log("\n━━ READER");

const descarga = await fetch(
  acceso.json.url.startsWith("http") ? acceso.json.url : `${BASE}${acceso.json.url}`,
);
check(descarga.ok, "19. el archivo se descarga desde la URL firmada");

const bytes = Buffer.from(await descarga.arrayBuffer());
check(
  createHash("sha256").update(bytes).digest("hex") === checksum,
  "20. el contenido entregado es EXACTAMENTE el que subió el creador",
);

// ══════════════════════════════════════ AISLAMIENTO

console.log("\n━━ AISLAMIENTO ENTRE USUARIOS");

const tercero = await registrar();

const ajeno = await call("POST", `/api/works/${slug}/access`, { cookie: tercero.cookie });
check(ajeno.res.status === 403, "21. otro usuario NO obtiene acceso");

const bibliotecaAjena = await call("GET", "/api/library", { cookie: tercero.cookie });
check(
  !bibliotecaAjena.json?.items?.some((i) => i.slug === slug),
  "22. la obra no aparece en su biblioteca",
);

const recompra = await call("POST", "/api/checkout", {
  cookie: comprador.cookie,
  body: { slug, idempotencyKey: randomUUID() },
});
check(recompra.res.status === 409, "23. no se puede comprar dos veces");

// ══════════════════════════════════════ BUG #3: OBRA GRATUITA

console.log("\n━━ OBRA GRATUITA (priceMinor = 0)");

const gratis = await call("POST", "/api/checkout", {
  cookie: comprador.cookie,
  body: { slug: obraJuego.slug, idempotencyKey: randomUUID() },
});

check(gratis.res.status === 200, `24. obra gratuita NO da 500 (fue ${gratis.res.status})`);
check(gratis.json?.free === true, "25. se marca como gratuita");
check(gratis.json?.orderId === null, "26. no crea orden de pago");

const bibGratis = await call("GET", "/api/library", { cookie: comprador.cookie });
check(
  bibGratis.json?.items?.some((i) => i.slug === obraJuego.slug),
  "27. la obra gratuita aparece en la biblioteca",
);

const accesoGratis = await call("POST", `/api/works/${obraJuego.slug}/access`, {
  cookie: comprador.cookie,
});
check(accesoGratis.res.status === 200, "28. se puede acceder al contenido gratuito");

const repetirGratis = await call("POST", "/api/checkout", {
  cookie: comprador.cookie,
  body: { slug: obraJuego.slug, idempotencyKey: randomUUID() },
});
check(repetirGratis.res.status === 409, "29. reclamarla dos veces da 409, no 500");

// ══════════════════════════════════════ PORTADA

console.log("\n━━ PORTADA");

// PNG minimo valido (1x1)
const png = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c6360000002000100" +
    "05fe02fea7bb3d0d0000000049454e44ae426082",
  "hex",
);
const pngSum = createHash("sha256").update(png).digest("hex");

const resPortada = await call("POST", "/api/uploads", {
  cookie: creador.cookie,
  body: {
    filename: "portada.png",
    mimeType: "image/png",
    sizeBytes: png.length,
    checksum: pngSum,
    purpose: "cover",
  },
});
check(resPortada.res.status === 200, "32. portada reservada con purpose=cover");

await fetch(resPortada.json.upload.url, { method: "PUT", body: png });
const cierrePortada = await call("POST", `/api/uploads/${resPortada.json.uploadId}/complete`, {
  cookie: creador.cookie,
  body: { checksum: pngSum },
});
check(cierrePortada.res.status === 200, "33. portada verificada");

const conPortada = await publicarConPortada(resPortada.json.uploadId);
check(Boolean(conPortada?.slug), "34. obra publicada con portada");

const fichaPortada = await call("GET", `/api/works/${conPortada.slug}`);
check(
  typeof fichaPortada.json?.work?.coverUrl === "string" &&
    fichaPortada.json.work.coverUrl.includes("/api/uploads/public/"),
  "35. la ficha devuelve la URL de portada",
);

const imagen = await fetch(fichaPortada.json.work.coverUrl);
check(imagen.ok, "36. la portada se descarga SIN firma (es publica)");

const bytesImg = Buffer.from(await imagen.arrayBuffer());
check(
  createHash("sha256").update(bytesImg).digest("hex") === pngSum,
  "37. la imagen servida es la que se subio",
);

// La ruta publica NO debe servir contenido protegido.
const fuga = await fetch(
  `${BASE}/api/uploads/public/${encodeURIComponent("content/" + reserva.json.uploadId + ".pdf")}`,
);
check(fuga.status === 403, "38. la ruta publica NO sirve archivos de contenido");

// ══════════════════════════════════════ BUG #4: ESTABILIDAD DEL POOL

console.log("\n━━ ESTABILIDAD");

// Muchas peticiones seguidas: el pool recicla conexiones y no debe caerse.
const rafaga = await Promise.all(
  Array.from({ length: 40 }, () => call("GET", "/api/works")),
);
check(rafaga.every((r) => r.res.status === 200), "30. 40 peticiones en paralelo sin fallos");

const vivo = await call("GET", "/ready");
check(vivo.res.status === 200, "31. el backend sigue vivo despues de la rafaga");

console.log(`\n${bad === 0 ? "E2E COMPLETO ✓" : `${bad} FALLOS`} — ${ok} comprobaciones\n`);
process.exit(bad === 0 ? 0 : 1);
