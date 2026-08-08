import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { after, before, describe, test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/sauce_test";
process.env.ISSUER_PRIVATE_KEY ??=
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.LICENSE_NFT_ADDRESS ??= "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
process.env.CHAIN_ID ??= "31337";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./storage-test";

const { pool } = await import("../src/db.js");
const { migrate } = await import("../src/lib/migrate.js");
const { buildApp } = await import("../src/app.js");
const { buildSiweMessage } = await import("../src/lib/session.js");

const app = await buildApp();
const creator = privateKeyToAccount(generatePrivateKey());

before(async () => {
  await migrate();
});

after(async () => {
  await app.close();
  await pool.end();
  await rm("./storage-test", { recursive: true, force: true });
});

async function login(account: typeof creator): Promise<string> {
  const { nonce } = (await app.inject({ method: "GET", url: "/api/auth/nonce" })).json();
  const signature = await account.signMessage({
    message: buildSiweMessage(account.address, nonce, "SAUCE"),
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/verify",
    payload: { address: account.address, nonce, signature },
  });

  const cookie = res.cookies.find((c) => c.name === "sauce_session");
  return `sauce_session=${cookie!.value}`;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

describe("subida de archivos", () => {
  test("reservar, subir, verificar y publicar", async () => {
    const cookie = await login(creator);

    await app.inject({
      method: "POST",
      url: "/api/creators",
      headers: { cookie },
      payload: { handle: `estudio${Date.now() % 1_000_000}`, name: "Estudio Prueba" },
    });

    // Un archivo pequeño que hace de novela visual.
    const file = Buffer.from(`novela-visual-de-prueba-${randomUUID()}`.repeat(64));
    const checksum = sha256(file);

    // --- 1. reservar
    const created = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { cookie },
      payload: {
        filename: "hoshizora.zip",
        mimeType: "application/zip",
        sizeBytes: file.length,
        checksum,
        purpose: "content",
      },
    });

    assert.equal(created.statusCode, 200, created.body);
    const { uploadId, upload } = created.json();
    assert.ok(upload.url.includes("/api/uploads/data/"), "devuelve URL prefirmada");
    assert.equal(upload.method, "PUT");

    // --- 2. subir a la URL prefirmada
    const path = upload.url.replace("http://localhost:4000", "");

    const put = await app.inject({
      method: "PUT",
      url: path,
      payload: file,
      headers: { "content-type": "application/octet-stream" },
    });
    assert.equal(put.statusCode, 200, put.body);

    // --- 3. cerrar
    const done = await app.inject({
      method: "POST",
      url: `/api/uploads/${uploadId}/complete`,
      headers: { cookie },
      payload: { checksum },
    });

    assert.equal(done.statusCode, 200, done.body);
    assert.equal(done.json().sizeBytes, file.length);

    // Cerrar dos veces no rompe: la red reintenta y el cliente no siempre sabe
    // si la primera llamada llegó.
    const again = await app.inject({
      method: "POST",
      url: `/api/uploads/${uploadId}/complete`,
      headers: { cookie },
      payload: { checksum },
    });
    assert.equal(again.json().alreadyCompleted, true);

    // --- 4. publicar usando esa subida
    const published = await app.inject({
      method: "POST",
      url: "/api/works",
      headers: { cookie },
      payload: {
        title: "Hoshizora no Kanata",
        description: "Novela visual de prueba",
        category: "visual_novel",
        uploadId,
        priceMinor: 3800,
      },
    });

    assert.equal(published.statusCode, 200, published.body);

    // El contentHash de la obra ES el checksum del archivo. No un valor que el
    // cliente declaró: el que el servidor verificó.
    const stored = await pool.query("SELECT content_hash FROM works WHERE slug = $1", [
      published.json().work.slug,
    ]);
    assert.equal(stored.rows[0]!.content_hash, `0x${checksum}`);
  });

  test("un hash que no coincide se rechaza", async () => {
    const cookie = await login(privateKeyToAccount(generatePrivateKey()));
    const file = Buffer.from("contenido real");

    const { uploadId, upload } = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "x.zip",
          mimeType: "application/zip",
          sizeBytes: file.length,
          purpose: "content",
        },
      })
    ).json();

    await app.inject({
      method: "PUT",
      url: upload.url.replace("http://localhost:4000", ""),
      payload: file,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/uploads/${uploadId}/complete`,
      headers: { cookie },
      payload: { checksum: "0".repeat(64) },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "checksum_mismatch");
  });

  test("declarar un tamaño y subir otro se rechaza", async () => {
    const cookie = await login(privateKeyToAccount(generatePrivateKey()));
    const file = Buffer.from("mucho mas grande de lo declarado".repeat(50));

    const { uploadId, upload } = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "y.zip",
          mimeType: "application/zip",
          sizeBytes: 10,
          purpose: "content",
        },
      })
    ).json();

    await app.inject({
      method: "PUT",
      url: upload.url.replace("http://localhost:4000", ""),
      payload: file,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/uploads/${uploadId}/complete`,
      headers: { cookie },
      payload: { checksum: sha256(file) },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "size_mismatch");
  });

  test("una firma manipulada no permite escribir", async () => {
    const cookie = await login(privateKeyToAccount(generatePrivateKey()));

    const { upload } = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "z.zip",
          mimeType: "application/zip",
          sizeBytes: 100,
          purpose: "content",
        },
      })
    ).json();

    const tampered = upload.url
      .replace("http://localhost:4000", "")
      .replace(/signature=[a-f0-9]+/, "signature=" + "f".repeat(64));

    const res = await app.inject({ method: "PUT", url: tampered, payload: Buffer.from("x") });

    assert.equal(res.statusCode, 403);
  });

  test("no se puede publicar con una subida sin terminar", async () => {
    const cookie = await login(privateKeyToAccount(generatePrivateKey()));

    await app.inject({
      method: "POST",
      url: "/api/creators",
      headers: { cookie },
      payload: { handle: `pend${Date.now() % 1_000_000}`, name: "Pendiente" },
    });

    const { uploadId } = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "sin-terminar.zip",
          mimeType: "application/zip",
          sizeBytes: 500,
          purpose: "content",
        },
      })
    ).json();

    const res = await app.inject({
      method: "POST",
      url: "/api/works",
      headers: { cookie },
      payload: {
        title: "Obra fantasma",
        category: "visual_novel",
        uploadId,
        priceMinor: 1000,
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "upload_incomplete");
  });

  test("el mismo archivo no se sube dos veces", async () => {
    const cookie = await login(privateKeyToAccount(generatePrivateKey()));
    const file = Buffer.from(`duplicado-${randomUUID()}`);
    const checksum = sha256(file);

    const first = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "dup.zip",
          mimeType: "application/zip",
          sizeBytes: file.length,
          checksum,
          purpose: "content",
        },
      })
    ).json();

    await app.inject({
      method: "PUT",
      url: first.upload.url.replace("http://localhost:4000", ""),
      payload: file,
    });

    await app.inject({
      method: "POST",
      url: `/api/uploads/${first.uploadId}/complete`,
      headers: { cookie },
      payload: { checksum },
    });

    const second = (
      await app.inject({
        method: "POST",
        url: "/api/uploads",
        headers: { cookie },
        payload: {
          filename: "otro-nombre.zip",
          mimeType: "application/zip",
          sizeBytes: file.length,
          checksum,
          purpose: "content",
        },
      })
    ).json();

    assert.equal(second.deduplicated, true, "reutiliza la subida previa");
    assert.equal(second.uploadId, first.uploadId);
    assert.equal(second.upload, null, "no hace falta transferir de nuevo");
  });
});
