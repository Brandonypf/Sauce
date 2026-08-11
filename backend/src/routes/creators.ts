import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isUniqueViolation, pool, tx } from "../db.js";
import { env } from "../env.js";
import { badRequest, conflict, forbidden } from "../lib/errors.js";
import { requireSession } from "../lib/session.js";

const registerBody = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, "Solo minusculas, numeros y guion bajo"),
  name: z.string().min(1).max(80),
  bio: z.string().max(500).default(""),
  payoutAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

const publishBody = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  // `format` es la fuente de verdad y coincide con el enum `work_format` de
  // Postgres. Antes se aceptaba `category` como texto libre y NUNCA se escribia
  // `format`, que se quedaba en su valor por defecto 'game': por eso toda obra
  // aparecia como juego sin importar lo que eligiera el creador.
  //
  // Se acepta `format` o `category` para no romper a quien ya envia el nombre
  // viejo, pero ambos se validan contra el mismo enum.
  format: z.enum(["game", "manga", "visual_novel", "artbook", "audio"]).optional(),
  category: z.enum(["game", "manga", "visual_novel", "artbook", "audio"]).optional(),
  coverUrl: z.string().url().or(z.literal("")).default(""),
  // El hash ya no lo declara el cliente a mano: sale de una subida completada y
  // verificada. Antes se podía publicar cualquier hash sin tener el archivo.
  uploadId: z.string().uuid(),
  coverUploadId: z.string().uuid().optional(),
  priceMinor: z.number().int().min(0),
  priceCurrency: z.string().length(3).default("PEN"),
});

export async function creatorRoutes(app: FastifyInstance) {
  /**
   * Registro de creador.
   *
   * El caso que te preocupaba — varias cuentas registrandose a la vez — se
   * resuelve entero en el INSERT. Dos peticiones con el mismo handle en el mismo
   * milisegundo: Postgres deja pasar una y le da 23505 a la otra, que responde
   * 409. Comprobar antes con un SELECT no sirve: entre el SELECT y el INSERT cabe
   * la otra peticion.
   */
  app.post("/api/creators", async (request) => {
    const user = requireSession(request.user);
    const body = registerBody.parse(request.body);

    try {
      const { rows } = await pool.query(
        `INSERT INTO creators (user_id, handle, name, bio, payout_address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, handle, name, bio, payout_address`,
        [user.userId, body.handle, body.name, body.bio, body.payoutAddress ?? null],
      );

      return { creator: rows[0] };
    } catch (error) {
      if (isUniqueViolation(error, "creators_handle_key")) {
        throw conflict("handle_taken", "Ese handle ya esta ocupado");
      }
      if (isUniqueViolation(error, "creators_user_key")) {
        throw conflict("already_creator", "Esta wallet ya tiene un perfil de creador");
      }
      throw error;
    }
  });

  app.get("/api/creators/me/works", async (request) => {
    const user = requireSession(request.user);

    const { rows } = await pool.query(
      `SELECT w.slug, w.title, w.status, w.content_id, w.price_minor, w.price_currency,
              w.published_at
         FROM works w
         JOIN creators c ON c.id = w.creator_id
        WHERE c.user_id = $1
        ORDER BY w.created_at DESC`,
      [user.userId],
    );

    return { works: rows };
  });

  /**
   * Publicar una obra.
   *
   * Igual que arriba, pero con dos indices unicos: el slug y el hash del
   * contenido. El segundo espeja `contentIdByHash` del ContentRegistry, asi que
   * subir el mismo archivo dos veces falla en la base de datos antes de llegar a
   * la cadena y gastar gas para revertir.
   */
  app.post("/api/works", async (request) => {
    const user = requireSession(request.user);
    const body = publishBody.parse(request.body);

    const creator = await pool.query<{ id: string }>(
      `SELECT id FROM creators WHERE user_id = $1 AND status = 'active'`,
      [user.userId],
    );

    if (!creator.rowCount) throw forbidden("Necesitas un perfil de creador activo");

    // El hash y el archivo salen de una subida completada, no de lo que declare
    // el cliente. Con `contentHash` suelto se podía publicar una obra sin tener
    // el archivo, y ese hash acababa siendo la atestación on-chain de autoría.
    const upload = await pool.query<{ checksum: string; status: string; user_id: string }>(
      `SELECT checksum, status, user_id FROM uploads WHERE id = $1`,
      [body.uploadId],
    );

    const file = upload.rows[0];
    if (!file) throw badRequest("unknown_upload", "La subida no existe");
    if (file.user_id !== user.userId) throw forbidden("Esa subida no es tuya");
    if (file.status !== "completed") {
      throw badRequest("upload_incomplete", "Termina de subir el archivo antes de publicar");
    }

    // Un solo valor alimenta `format` y `category`, asi no pueden divergir.
    const formato = body.format ?? body.category;

    if (!formato) {
      throw badRequest("missing_format", "Indica el formato de la obra");
    }

    // Portada: opcional a proposito. Una obra sin portada debe seguir
    // publicandose; la interfaz ya dibuja un hueco cuando falta.
    let coverUrl = body.coverUrl ?? "";

    if (body.coverUploadId) {
      const portada = await pool.query<{ storage_key: string; status: string; user_id: string }>(
        `SELECT storage_key, status, user_id FROM uploads WHERE id = $1`,
        [body.coverUploadId],
      );

      const cov = portada.rows[0];
      if (!cov) throw badRequest("unknown_cover", "La portada no existe");
      if (cov.user_id !== user.userId) throw forbidden("Esa portada no es tuya");
      if (cov.status !== "completed") {
        throw badRequest("cover_incomplete", "Termina de subir la portada");
      }

      // Se guarda la ruta de acceso, no una URL firmada: las firmadas caducan y
      // guardar uno seria guardar un permiso vencido. La portada es publica.
      coverUrl = `${env.PUBLIC_API_URL}/api/uploads/public/${encodeURIComponent(cov.storage_key)}`;
    }

    const contentHash = `0x${file.checksum}`;
    const slug = slugify(body.title);

    try {
      return await tx(async (db) => {
        const { rows } = await db.query(
          `INSERT INTO works
             (creator_id, slug, title, description, category, format, cover_url,
              content_hash, price_minor, price_currency, status, published_at)
           VALUES ($1, $2, $3, $4, $5::text, $5::work_format, $6, $7, $8, $9, 'published', now())
           RETURNING id, slug, title, status, format`,
          [
            creator.rows[0]!.id,
            slug,
            body.title,
            body.description,
            formato,
            coverUrl,
            contentHash.toLowerCase(),
            body.priceMinor,
            body.priceCurrency,
          ],
        );

        const work = rows[0]!;

        // El registro on-chain se encola. La obra queda publicada en el catalogo
        // de inmediato; el `content_id` llega cuando la transaccion confirma.
        await db.query(`INSERT INTO outbox (kind, payload) VALUES ('register_content', $1)`, [
          JSON.stringify({
            workId: work.id,
            contentHash: contentHash.toLowerCase(),
            metadataUri: body.coverUrl,
          }),
        ]);

        return { work };
      });
    } catch (error) {
      if (isUniqueViolation(error, "works_content_hash_key")) {
        throw conflict("duplicate_content", "Ese archivo ya fue publicado");
      }
      if (isUniqueViolation(error, "works_slug_key")) {
        throw conflict("slug_taken", "Ya existe una obra con ese titulo");
      }
      throw error;
    }
  });
}

function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  // Sufijo corto y estable: dos obras con el mismo titulo no chocan, y el slug
  // sigue siendo legible.
  const suffix = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 6);

  return `${base || "obra"}-${suffix}`;
}
