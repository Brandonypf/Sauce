/**
 * Prueba del contrato que usa el frontend.
 *
 * No usa `app.inject`: abre sockets HTTP reales contra el backend levantado y
 * envía exactamente el mismo payload que construye `AuthContext.register()`.
 * Compilar no demuestra nada aquí — el fallo era de forma del cuerpo, y eso solo
 * se ve enviándolo.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE = process.env.API_URL ?? "http://127.0.0.1:4000";

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  ok    ${label}`);
    passed++;
  } else {
    console.log(`  FALLA ${label}`);
    failed++;
  }
}

/** Extrae la cookie de sesión de la cabecera Set-Cookie. */
function sessionCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const found = raw.map((c) => c.split(";")[0]).find((c) => c.startsWith("sauce_session="));
  return found ?? "";
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  return { res, json };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
  });

  return { res, json: await res.json().catch(() => null) };
}

const email = `frontend-test-${randomUUID().slice(0, 8)}@sauce.test`;
const password = "una-frase-larga-y-segura";

console.log("\n── 1. El bug original: el objeto entero como email");

// Esto es lo que enviaba el codigo roto: register(form) con form como primer
// argumento posicional, asi que `email` acababa siendo el objeto completo.
const roto = await post("/api/auth/register", {
  email: { name: "Ana", email, password },
  password: undefined,
});

check(roto.res.status === 400, "reproduce el 400 Bad Request");
check(roto.json?.error === "validation_error", "el backend lo marca como validation_error");
check(Array.isArray(roto.json?.issues), "y devuelve `issues` con el detalle");

console.log("\n── 2. El payload que construye AuthContext ahora");

// `name` traducido a `displayName`, campos planos.
const bueno = await post("/api/auth/register", {
  email,
  password,
  displayName: "Ana Prueba",
});

check(bueno.res.status === 200, `registro devuelve 200 (fue ${bueno.res.status})`);

const cookie = sessionCookie(bueno.res);
check(cookie.length > 0, "emite cookie de sesion");
check(
  (bueno.res.headers.getSetCookie?.() ?? []).some((c) => /HttpOnly/i.test(c)),
  "la cookie es HttpOnly",
);

console.log("\n── 3. Sesion viva");

const me = await get("/api/auth/me", cookie);
check(me.json?.authenticated === true, "authenticated: true");
check(me.json?.email === email.toLowerCase(), "devuelve el email correcto");
check(me.json?.wallet === null, "usuario sin wallet");
check(me.json?.displayName === "Ana Prueba", "displayName llego desde `name` del formulario");

console.log("\n── 4. Persistencia tras recargar (F5)");

// Un F5 es exactamente esto: nueva peticion con la misma cookie, sin estado
// de React de por medio.
const trasF5 = await get("/api/auth/me", cookie);
check(trasF5.json?.authenticated === true, "la sesion sobrevive a la recarga");

console.log("\n── 5. Contrasena corta: el mensaje debe ser util");

const corta = await post("/api/auth/register", {
  email: `otro-${randomUUID().slice(0, 8)}@sauce.test`,
  password: "corta",
});

check(corta.res.status === 400, "rechaza la contrasena corta");

const mensajes = (corta.json?.issues ?? []).map((i) => i.message).join(". ");
check(
  mensajes.includes("12"),
  `el detalle explica el minimo, no solo "Datos invalidos" (fue: "${mensajes}")`,
);

console.log("\n── 6. Logout");

const salida = await post("/api/auth/logout", {}, cookie);
check(salida.res.status === 200, "logout devuelve 200");

const trasLogout = await get("/api/auth/me", cookie);
check(trasLogout.json?.authenticated === false, "la cookie queda invalidada");

console.log("\n── 7. Login");

const entrada = await post("/api/auth/login", { email, password });
check(entrada.res.status === 200, `login devuelve 200 (fue ${entrada.res.status})`);

const cookie2 = sessionCookie(entrada.res);
check(cookie2.length > 0, "emite cookie nueva");

const me2 = await get("/api/auth/me", cookie2);
check(me2.json?.authenticated === true, "authenticated tras login");

const me2F5 = await get("/api/auth/me", cookie2);
check(me2F5.json?.authenticated === true, "sigue autenticado tras recargar");

console.log("\n── 8. Credenciales incorrectas");

const mala = await post("/api/auth/login", { email, password: "otra-cosa-distinta" });
check(mala.res.status === 401, "contrasena incorrecta da 401");
check(!JSON.stringify(mala.json).includes(password), "la respuesta no filtra la contrasena");

console.log(`\n${failed === 0 ? "TODO CORRECTO" : `${failed} FALLOS`} — ${passed} comprobaciones`);
process.exit(failed === 0 ? 0 : 1);
