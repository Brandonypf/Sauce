import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, tx } from "../db.js";
import { env, isProd } from "../env.js";
import {
  buildSiweMessage,
  consumeNonce,
  createSession,
  issueNonce,
  upsertUser,
  verifySignature,
} from "../lib/session.js";
import { badRequest } from "../lib/errors.js";

const verifyBody = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.string().min(8),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/nonce", async () => {
    const nonce = await tx((db) => issueNonce(db));
    return { nonce, domain: "SAUCE" };
  });

  app.post("/api/auth/verify", async (request, reply) => {
    const body = verifyBody.parse(request.body);
    const message = buildSiweMessage(body.address, body.nonce, "SAUCE");

    const valid = await verifySignature(body.address, message, body.signature);
    if (!valid) throw badRequest("bad_signature", "La firma no corresponde a esa direccion");

    const sessionId = await tx(async (db) => {
      // El nonce se consume dentro de la misma transaccion que crea la sesion:
      // dos peticiones con la misma firma, solo una obtiene sesion.
      await consumeNonce(db, body.nonce);
      const userId = await upsertUser(db, body.address);
      return createSession(db, userId);
    });

    reply.setCookie(env.SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: env.SESSION_TTL_HOURS * 3600,
    });

    return { address: body.address.toLowerCase() };
  });

  app.get("/api/auth/me", async (request) => {
    if (!request.user) return { authenticated: false };
    return { authenticated: true, address: request.user.wallet };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[env.SESSION_COOKIE];
    if (sessionId) await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    reply.clearCookie(env.SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
