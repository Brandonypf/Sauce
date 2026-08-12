import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { env } from "../env.js";
import { forbidden, notFound } from "../lib/errors.js";
import { requireSession } from "../lib/session.js";

export async function libraryRoutes(app: FastifyInstance) {
  app.get("/api/library", async (request) => {
    const user = requireSession(request.user);

    const { rows } = await pool.query(
      `SELECT w.slug, w.title, w.cover_url, w.category, w.content_id,
              c.handle AS creator_handle, c.name AS creator_name,
              e.created_at AS acquired_at, e.source,
              v.redeemed_at, o.id AS order_id
         FROM entitlements e
         JOIN works w ON w.id = e.work_id
         JOIN creators c ON c.id = w.creator_id
    LEFT JOIN orders o ON o.id = e.order_id
    LEFT JOIN vouchers v ON v.order_id = o.id
        WHERE e.user_id = $1
          AND e.revoked_at IS NULL
        ORDER BY e.created_at DESC`,
      [user.userId],
    );

    return {
      items: rows.map((r) => ({
        slug: r.slug,
        title: r.title,
        coverUrl: r.cover_url,
        category: r.category,
        contentId: r.content_id === null ? null : String(r.content_id),
        creatorHandle: r.creator_handle,
        creatorName: r.creator_name,
        acquiredAt: r.acquired_at,
        source: r.source,
        orderId: r.order_id,
        onchainClaimed: Boolean(r.redeemed_at),
      })),
    };
  });

  app.post("/api/works/:slug/access", async (request) => {
    const user = requireSession(request.user);
    const { slug } = request.params as { slug: string };

    const { rows } = await pool.query<{
      slug: string;
      content_hash: string;
      entitlement_id: string | null;
      storage_key: string | null;
    }>(
      `SELECT
          w.slug,
          w.content_hash,
          e.id AS entitlement_id,
          u.storage_key
       FROM works w
       LEFT JOIN entitlements e
         ON e.work_id = w.id
        AND e.user_id = $2
        AND e.revoked_at IS NULL
       LEFT JOIN uploads u
         ON lower(u.checksum) =
            lower(REPLACE(w.content_hash, '0x', ''))
        AND u.status = 'completed'
       WHERE lower(w.slug) = lower($1)`,
      [slug, user.userId],
    );

    const row = rows[0];

    if (!row) {
      throw notFound("Obra no encontrada");
    }

    if (!row.entitlement_id) {
      throw forbidden("No tienes licencia de esta obra");
    }

    if (!row.storage_key) {
      throw notFound("El contenido de la obra no está disponible");
    }

    const expiresAt =
      Math.floor(Date.now() / 1000) + env.CONTENT_URL_TTL_SECONDS;

    const token = createHmac("sha256", env.GATEWAY_WEBHOOK_SECRET)
      .update(`${row.storage_key}:${expiresAt}`)
      .digest("hex");

    return {
      url:
        `/api/uploads/data/${encodeURIComponent(row.storage_key)}` +
        `?expires=${expiresAt}&signature=${token}`,
      expiresAt,
    };
  });
}
