import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { notFound } from "../lib/errors.js";

const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(24),
  offset: z.coerce.number().min(0).default(0),
});

const SELECT_WORK = `
  SELECT w.id, w.slug, w.content_id, w.title, w.description, w.category,
         w.cover_url, w.price_minor, w.price_currency, w.published_at,
         c.handle AS creator_handle, c.name AS creator_name
    FROM works w
    JOIN creators c ON c.id = w.creator_id
`;

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/api/works", async (request) => {
    const { category, q, limit, offset } = listQuery.parse(request.query);

    const { rows } = await pool.query(
      `${SELECT_WORK}
        WHERE w.status = 'published'
          AND ($1::text IS NULL OR w.category = $1)
          AND ($2::text IS NULL OR w.title ILIKE '%' || $2 || '%')
        ORDER BY w.published_at DESC
        LIMIT $3 OFFSET $4`,
      [category ?? null, q ?? null, limit, offset],
    );

    return { works: rows.map(toWork) };
  });

  app.get("/api/works/:slug", async (request) => {
    const { slug } = request.params as { slug: string };

    const { rows } = await pool.query(`${SELECT_WORK} WHERE lower(w.slug) = lower($1)`, [slug]);
    const row = rows[0];
    if (!row) throw notFound("Obra no encontrada");

    let owned = false;

    if (request.user) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM entitlements
          WHERE user_id = $1 AND work_id = $2 AND revoked_at IS NULL`,
        [request.user.userId, row.id],
      );
      owned = Boolean(rowCount);
    }

    return { work: { ...toWork(row), owned } };
  });

  app.get("/api/creators/:handle", async (request) => {
    const { handle } = request.params as { handle: string };

    const { rows } = await pool.query(
      `SELECT c.id, c.handle, c.name, c.bio, c.profile_uri
         FROM creators c
        WHERE lower(c.handle) = lower($1) AND c.status = 'active'`,
      [handle],
    );

    const creator = rows[0];
    if (!creator) throw notFound("Creador no encontrado");

    const works = await pool.query(
      `${SELECT_WORK} WHERE w.creator_id = $1 AND w.status = 'published'
        ORDER BY w.published_at DESC`,
      [creator.id],
    );

    return { creator, works: works.rows.map(toWork) };
  });
}

function toWork(row: Record<string, unknown>) {
  return {
    slug: row.slug,
    contentId: row.content_id === null ? null : String(row.content_id),
    title: row.title,
    description: row.description,
    category: row.category,
    coverUrl: row.cover_url,
    priceMinor: Number(row.price_minor),
    priceCurrency: row.price_currency,
    creatorHandle: row.creator_handle,
    creatorName: row.creator_name,
    publishedAt: row.published_at,
  };
}
