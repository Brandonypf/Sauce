import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, tx } from "../db.js";
import { env } from "../env.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { requireSession } from "../lib/session.js";
import {
  buildStorageKey,
  storage,
  verifyStorageSignature,
  writeLocalObject,
} from "../lib/storage.js";

/**
 * Subida de archivos en tres pasos.
 *
 *   1. POST /api/uploads              → reserva y devuelve URL prefirmada
 *   2. PUT  <url prefirmada>          → el navegador sube DIRECTO al almacén
 *   3. POST /api/uploads/:id/complete → el servidor verifica y cierra
 *
 * El paso 2 no toca este servidor cuando el driver es S3/R2. Es lo que permite
 * subir archivos de varios GB sin bloquear el proceso ni pagar el tráfico dos
 * veces.
 *
 * El paso 3 no es un trámite: es donde se comprueba que lo que hay en el almacén
 * es lo que se dijo que sería. Sin él, "ya subí el archivo" sería otra cosa que
 * el cliente afirma y el servidor cree.
 */

const createBody = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "SHA-256 en hexadecimal minúscula")
    .optional(),
  purpose: z.enum(["content", "cover", "chapter", "media"]).default("content"),
});

const completeBody = z.object({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/api/uploads", async (request) => {
    const user = requireSession(request.user);
    const body = createBody.parse(request.body);

    if (body.sizeBytes > env.MAX_UPLOAD_BYTES) {
      throw badRequest(
        "file_too_large",
        `El archivo supera el máximo de ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
      );
    }

    // Si el mismo archivo ya está subido, se reutiliza en vez de volver a
    // transferirlo. Con un catálogo de novelas visuales de varios GB esto ahorra
    // tiempo real, no bytes teóricos.
    if (body.checksum) {
      const existing = await pool.query<{ id: string; storage_key: string }>(
        `SELECT id, storage_key FROM uploads
          WHERE checksum = $1 AND status = 'completed'`,
        [body.checksum],
      );

      if (existing.rowCount) {
        return {
          uploadId: existing.rows[0]!.id,
          deduplicated: true,
          upload: null,
        };
      }
    }

    const driver = await storage();

    const created = await tx(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO uploads
           (user_id, filename, mime_type, declared_size, checksum, storage_key,
            storage_driver, purpose)
         VALUES ($1, $2, $3, $4, $5, '', $6, $7)
         RETURNING id`,
        [
          user.userId,
          body.filename,
          body.mimeType,
          body.sizeBytes,
          body.checksum ?? null,
          driver.name,
          body.purpose,
        ],
      );

      const id = rows[0]!.id;
      const key = buildStorageKey(body.purpose, id, body.filename);

      await db.query("UPDATE uploads SET storage_key = $2 WHERE id = $1", [id, key]);

      return { id, key };
    });

    const presigned = await driver.presignUpload(created.key, body.mimeType, body.sizeBytes);

    return {
      uploadId: created.id,
      deduplicated: false,
      upload: presigned,
    };
  });

  /**
   * Cierra la subida.
   *
   * Se comprueba tamaño y, cuando el driver puede calcularlo, el hash real del
   * objeto contra el que declaró el navegador. Con S3 la comprobación la hace el
   * propio almacén mediante `ChecksumSHA256` en la petición prefirmada, porque
   * descargar varios GB para hashearlos aquí no es viable.
   */
  app.post("/api/uploads/:id/complete", async (request) => {
    const user = requireSession(request.user);
    const { id } = request.params as { id: string };
    const body = completeBody.parse(request.body);

    const { rows } = await pool.query<{
      storage_key: string;
      declared_size: string;
      status: string;
      user_id: string;
    }>(
      `SELECT storage_key, declared_size, status, user_id FROM uploads WHERE id = $1`,
      [id],
    );

    const upload = rows[0];
    if (!upload) throw notFound("Subida desconocida");
    if (upload.user_id !== user.userId) throw forbidden("Esta subida no es tuya");

    if (upload.status === "completed") {
      return { uploadId: id, status: "completed", alreadyCompleted: true };
    }

    if (upload.status !== "pending") {
      throw conflict("upload_not_pending", `La subida está en estado ${upload.status}`);
    }

    const driver = await storage();
    const head = await driver.head(upload.storage_key);

    if (!head) throw badRequest("not_uploaded", "No se encontró el archivo en el almacenamiento");

    if (head.size !== Number(upload.declared_size)) {
      throw badRequest(
        "size_mismatch",
        `Se declararon ${upload.declared_size} bytes y se subieron ${head.size}`,
      );
    }

    const actual = await driver.checksum(upload.storage_key);

    if (actual && actual !== body.checksum) {
      // El archivo llegó corrupto o alguien intentó subir algo distinto de lo
      // que declaró. En ambos casos no puede convertirse en el contentHash de
      // una atestación on-chain.
      throw badRequest("checksum_mismatch", "El hash del archivo no coincide con el declarado");
    }

    await pool.query(
      `UPDATE uploads
          SET status = 'completed', actual_size = $2, checksum = $3, completed_at = now()
        WHERE id = $1`,
      [id, head.size, body.checksum],
    );

    return { uploadId: id, status: "completed", sizeBytes: head.size, checksum: body.checksum };
  });

  app.post("/api/uploads/:id/abort", async (request) => {
    const user = requireSession(request.user);
    const { id } = request.params as { id: string };

    const { rows } = await pool.query<{ storage_key: string; user_id: string }>(
      `UPDATE uploads SET status = 'aborted'
        WHERE id = $1 AND user_id = $2 AND status = 'pending'
        RETURNING storage_key, user_id`,
      [id, user.userId],
    );

    if (rows[0]) {
      const driver = await storage();
      await driver.remove(rows[0].storage_key);
    }

    return { aborted: Boolean(rows[0]) };
  });

  /**
   * Destino de la URL prefirmada del driver local.
   *
   * En producción con S3/R2 esta ruta no se usa: el navegador sube directo al
   * almacén. Existe para que el flujo completo se pueda probar en local sin
   * cuenta de Cloudflare, recorriendo exactamente los mismos pasos.
   */
  app.put("/api/uploads/data/*", async (request, reply) => {
    if (env.STORAGE_DRIVER !== "local") {
      throw notFound("Esta ruta solo existe con el driver local");
    }

    const key = decodeURIComponent((request.params as Record<string, string>)["*"] ?? "");
    const { expires, signature } = request.query as { expires?: string; signature?: string };

    if (!expires || !signature || !verifyStorageSignature(key, expires, signature)) {
      throw forbidden("URL de subida inválida o vencida");
    }

    const size = await writeLocalObject(key, request.raw);

    return reply.code(200).send({ key, sizeBytes: size });
  });

  app.get("/api/uploads/data/*", async (request, reply) => {
    if (env.STORAGE_DRIVER !== "local") {
      throw notFound("Esta ruta solo existe con el driver local");
    }

    const key = decodeURIComponent((request.params as Record<string, string>)["*"] ?? "");
    const { expires, signature } = request.query as { expires?: string; signature?: string };

    if (!expires || !signature || !verifyStorageSignature(key, expires, signature)) {
      throw forbidden("URL de descarga inválida o vencida");
    }

    const { createReadStream } = await import("node:fs");
    const { resolve, join } = await import("node:path");

    const root = resolve(env.STORAGE_LOCAL_DIR);
    const full = resolve(join(root, key));

    if (!full.startsWith(root)) throw forbidden("Ruta inválida");

    return reply.send(createReadStream(full));
  });
}
