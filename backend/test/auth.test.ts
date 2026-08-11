import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * Salvaguarda: estas pruebas crean y borran datos. Si `DATABASE_URL` apunta a
 * Supabase, escribirían en la base compartida del equipo.
 *
 * Se exige `TEST_DATABASE_URL` explícita y se comprueba que no sea remota antes
 * de tocar nada.
 */
const testUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/sauce_test";

if (/supabase|pooler\.supabase|amazonaws/i.test(testUrl)) {
  throw new Error(
    "Las pruebas NO pueden correr contra una base remota. Usa TEST_DATABASE_URL local.",
  );
}

process.env.DATABASE_URL = testUrl;
process.env.ISSUER_PRIVATE_KEY ??=
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.LICENSE_NFT_ADDRESS ??= "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
process.env.CHAIN_ID ??= "31337";
// Coste bajo solo en pruebas: 12 rondas por login harían la suite inútilmente lenta.
process.env.BCRYPT_ROUNDS = "4";

const { pool } = await import("../src/db.js");
const { migrate } = await import("../src/lib/migrate.js");
const { buildApp } = await import("../src/app.js");
const { buildSiweMessage } = await import("../src/lib/session.js");

const app = await buildApp();

before(async () => {
  await migrate();
});

after(async () => {
  await app.close();
  await pool.end();
});

const email = () => `demo-${randomUUID()}@sauce.test`;
const PASSWORD = "una-frase-larga-y-segura";

function cookieOf(res: Awaited<ReturnType<typeof app.inject>>): string {
  const c = res.cookies.find((x) => x.name === "sauce_session");
  return c ? `sauce_session=${c.value}` : "";
}

async function register(mail: string, password = PASSWORD) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: mail, password },
  });
}

describe("registro con email", () => {
  test("crea usuario sin wallet y abre sesion", async () => {
    const mail = email();
    const res = await register(mail);

    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().wallet, null, "la cuenta no necesita wallet");

    const cookie = cookieOf(res);
    assert.ok(cookie, "debe emitirse cookie de sesion");

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

    assert.equal(me.json().authenticated, true);
    assert.equal(me.json().email, mail.toLowerCase());
    assert.equal(me.json().canClaimOnchain, false, "sin wallet no puede reclamar on-chain");
  });

  test("el correo duplicado se rechaza", async () => {
    const mail = email();
    await register(mail);

    const second = await register(mail);

    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error, "email_taken");
  });

  test("la contrasena corta se rechaza", async () => {
    const res = await register(email(), "corta");

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "validation_error");
  });

  test("la contrasena nunca vuelve en la respuesta", async () => {
    const res = await register(email());

    assert.ok(!res.body.includes(PASSWORD), "la respuesta no puede contener la contrasena");
    assert.ok(!res.body.includes("password_hash"), "ni el hash");
  });

  test("la contrasena se guarda hasheada, no en claro", async () => {
    const mail = email();
    await register(mail);

    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [mail.toLowerCase()],
    );

    assert.notEqual(rows[0]!.password_hash, PASSWORD);
    assert.match(rows[0]!.password_hash, /^\$2[aby]\$/, "debe ser un hash bcrypt");
  });
});

describe("inicio de sesion", () => {
  test("credenciales correctas abren sesion", async () => {
    const mail = email();
    await register(mail);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: mail, password: PASSWORD },
    });

    assert.equal(res.statusCode, 200, res.body);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieOf(res) },
    });

    assert.equal(me.json().email, mail.toLowerCase());
  });

  test("la contrasena incorrecta falla", async () => {
    const mail = email();
    await register(mail);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: mail, password: "otra-cosa-completamente" },
    });

    assert.equal(res.statusCode, 401);
  });

  test("un correo inexistente da el MISMO mensaje que una contrasena mala", async () => {
    const existente = email();
    await register(existente);

    const malaPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: existente, password: "incorrecta-pero-larga" },
    });

    const noExiste = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: email(), password: "incorrecta-pero-larga" },
    });

    // Si los mensajes difirieran, se podria enumerar que correos estan
    // registrados sin acertar ni una contrasena.
    assert.equal(malaPassword.statusCode, noExiste.statusCode);
    assert.equal(malaPassword.json().message, noExiste.json().message);
  });

  test("cerrar sesion invalida la cookie", async () => {
    const mail = email();
    const cookie = cookieOf(await register(mail));

    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

    assert.equal(me.json().authenticated, false);
  });
});

describe("vincular wallet", () => {
  async function signNonce(account: ReturnType<typeof privateKeyToAccount>) {
    const { nonce } = (await app.inject({ method: "GET", url: "/api/auth/nonce" })).json();

    const signature = await account.signMessage({
      message: buildSiweMessage(account.address, nonce, "SAUCE"),
    });

    return { nonce, signature };
  }

  test("una cuenta de email puede vincular su wallet", async () => {
    const cookie = cookieOf(await register(email()));
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce, signature } = await signNonce(account);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/link-wallet",
      headers: { cookie },
      payload: { address: account.address, nonce, signature },
    });

    assert.equal(res.statusCode, 200, res.body);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

    assert.equal(me.json().wallet, account.address.toLowerCase());
    assert.equal(me.json().canClaimOnchain, true, "ya puede reclamar el recibo");
  });

  test("no se puede vincular una wallet que ya es de otra cuenta", async () => {
    const account = privateKeyToAccount(generatePrivateKey());

    const primera = cookieOf(await register(email()));
    const a = await signNonce(account);
    await app.inject({
      method: "POST",
      url: "/api/auth/link-wallet",
      headers: { cookie: primera },
      payload: { address: account.address, nonce: a.nonce, signature: a.signature },
    });

    const segunda = cookieOf(await register(email()));
    const b = await signNonce(account);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/link-wallet",
      headers: { cookie: segunda },
      payload: { address: account.address, nonce: b.nonce, signature: b.signature },
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, "wallet_in_use");
  });

  test("una firma de otra direccion no vincula nada", async () => {
    const cookie = cookieOf(await register(email()));
    const firmante = privateKeyToAccount(generatePrivateKey());
    const otra = privateKeyToAccount(generatePrivateKey());

    const { nonce, signature } = await signNonce(firmante);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/link-wallet",
      headers: { cookie },
      payload: { address: otra.address, nonce, signature },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "bad_signature");
  });

  test("sin sesion no se puede vincular", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce, signature } = await signNonce(account);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/link-wallet",
      payload: { address: account.address, nonce, signature },
    });

    assert.equal(res.statusCode, 401);
  });
});

describe("compatibilidad con SIWE", () => {
  test("el flujo de solo wallet sigue funcionando", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const { nonce } = (await app.inject({ method: "GET", url: "/api/auth/nonce" })).json();

    const signature = await account.signMessage({
      message: buildSiweMessage(account.address, nonce, "SAUCE"),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: { address: account.address, nonce, signature },
    });

    assert.equal(res.statusCode, 200, res.body);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieOf(res) },
    });

    assert.equal(me.json().wallet, account.address.toLowerCase());
    assert.equal(me.json().email, null, "una cuenta de wallet no tiene email");
  });
});
