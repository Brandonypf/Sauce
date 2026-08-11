import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { isUniqueViolation, pool, tx } from "../db.js";
import { env, isProd } from "../env.js";
import {
  buildSiweMessage,
  consumeNonce,
  createSession,
  issueNonce,
  requireSession,
  upsertUser,
  verifySignature,
} from "../lib/session.js";
import { hashPassword, verifyPassword, wastePasswordTime } from "../lib/password.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";

/**
 * Autenticacion hibrida.
 *
 * Email y contrasena es el camino principal; la wallet es un vinculo opcional
 * que se anade despues. Antes la identidad ERA la wallet, lo que obligaba a
 * instalar MetaMask antes de poder mirar el catalogo.
 *
 * Consecuencia importante y deliberada: **el entitlement no depende de la
 * wallet**. Quien compra sin wallet accede a su contenido igual, porque el
 * control de acceso lo decide `entitlements` en el servidor. Lo que no puede
 * hacer es reclamar el recibo on-chain, porque un voucher EIP-712 nombra una
 * direccion concreta y no hay ninguna a la que emitirlo.
 *
 * La alternativa —generar una wallet custodial por usuario— se descarto:
 * guardar llaves privadas de terceros cambia por completo el perfil de riesgo
 * del proyecto, y no aporta nada que el comprador note.
 */

const emailSchema = z.string().email().max(254);

// 12 caracteres y no 8. Un minimo de 8 con reglas de mayusculas y simbolos
// produce contrasenas peores que una frase larga, y mas faciles de romper.
const passwordSchema = z.string().min(12, "Al menos 12 caracteres").max(200, "Demasiado larga");

const registerBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(80).optional(),
});

const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const verifyBody = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  nonce: z.string().min(8),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(env.SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 3600,
  });
}

/** Fallos recientes de una cuenta concreta. */
async function recentFailures(email: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM login_attempts
      WHERE lower(email) = lower($1)
        AND succeeded = false
        AND attempted_at > now() - interval '15 minutes'`,
    [email],
  );

  return Number(rows[0]?.count ?? 0);
}

export async function authRoutes(app: FastifyInstance) {
  // ------------------------------------------------------ email + contrasena

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerBody.parse(request.body);
    const passwordHash = await hashPassword(body.password);

    try {
      const sessionId = await tx(async (db) => {
        const { rows } = await db.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [body.email.toLowerCase(), passwordHash, body.displayName ?? null],
        );

        return createSession(db, rows[0]!.id);
      });

      setSessionCookie(reply, sessionId);

      return { authenticated: true, email: body.email.toLowerCase(), wallet: null };
    } catch (error) {
      if (isUniqueViolation(error, "users_email_key")) {
        throw conflict("email_taken", "Ya existe una cuenta con ese correo");
      }

      throw error;
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginBody.parse(request.body);
    const ip = request.ip;

    // Freno por cuenta, no solo por IP: un atacante con muchas IP y un objetivo
    // fijo pasa por debajo de un limite basado unicamente en IP.
    if ((await recentFailures(body.email)) >= 10) {
      throw unauthorized("Demasiados intentos. Espera unos minutos.");
    }

    const { rows } = await pool.query<{
      id: string;
      email: string | null;
      wallet: string | null;
      password_hash: string | null;
    }>(`SELECT id, email, wallet, password_hash FROM users WHERE lower(email) = lower($1)`, [
      body.email,
    ]);

    const user = rows[0];

    // Si el usuario no existe se gasta el mismo tiempo igual. Sin esto, un correo
    // desconocido responde en 1 ms y uno real en 250 ms, y esa diferencia permite
    // enumerar que cuentas existen sin acertar ninguna contrasena.
    if (!user?.password_hash) {
      await wastePasswordTime(body.password);
      await pool.query(`INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, false)`, [
        body.email,
        ip,
      ]);

      throw unauthorized("Correo o contrasena incorrectos");
    }

    const valid = await verifyPassword(body.password, user.password_hash);

    await pool.query(`INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, $3)`, [
      body.email,
      ip,
      valid,
    ]);

    if (!valid) throw unauthorized("Correo o contrasena incorrectos");

    const sessionId = await tx(async (db) => {
      await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
      return createSession(db, user.id);
    });

    setSessionCookie(reply, sessionId);

    return { authenticated: true, email: user.email, wallet: user.wallet };
  });

  // ------------------------------------------------------------- wallet SIWE

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
      await consumeNonce(db, body.nonce);
      const userId = await upsertUser(db, body.address);
      return createSession(db, userId);
    });

    setSessionCookie(reply, sessionId);

    return { authenticated: true, address: body.address.toLowerCase() };
  });

  /**
   * Vincula una wallet a una cuenta que ya inicio sesion con email.
   *
   * Es lo que desbloquea el recibo on-chain para quien se registro sin wallet: a
   * partir de aqui `fulfillOrder` ya tiene una direccion a la que emitir voucher.
   */
  app.post("/api/auth/link-wallet", async (request) => {
    const session = requireSession(request.user);
    const body = verifyBody.parse(request.body);

    const message = buildSiweMessage(body.address, body.nonce, "SAUCE");

    const valid = await verifySignature(body.address, message, body.signature);
    if (!valid) throw badRequest("bad_signature", "La firma no corresponde a esa direccion");

    try {
      return await tx(async (db) => {
        await consumeNonce(db, body.nonce);

        // Solo se vincula si la cuenta no tenia wallet. Cambiar una ya vinculada
        // moveria la propiedad de las licencias emitidas a otra direccion, asi
        // que se rechaza en vez de resolverlo a la ligera.
        const { rowCount } = await db.query(
          `UPDATE users SET wallet = $2 WHERE id = $1 AND wallet IS NULL`,
          [session.userId, body.address.toLowerCase()],
        );

        if (!rowCount) {
          throw conflict("wallet_already_linked", "Esta cuenta ya tiene una wallet vinculada");
        }

        return { linked: true, wallet: body.address.toLowerCase() };
      });
    } catch (error) {
      if (isUniqueViolation(error, "users_wallet_key")) {
        throw conflict("wallet_in_use", "Esa wallet ya pertenece a otra cuenta");
      }

      throw error;
    }
  });

  // ----------------------------------------------------------------- sesion

  app.get("/api/auth/me", async (request) => {
    if (!request.user) return { authenticated: false };

    const { rows } = await pool.query<{
      email: string | null;
      wallet: string | null;
      display_name: string | null;
    }>(`SELECT email, wallet, display_name FROM users WHERE id = $1`, [request.user.userId]);

    const user = rows[0];

    return {
      authenticated: true,
      email: user?.email ?? null,
      wallet: user?.wallet ?? null,
      displayName: user?.display_name ?? null,
      // El frontend lo usa para ofrecer "vincular wallet" solo a quien no la tiene.
      canClaimOnchain: Boolean(user?.wallet),
    };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[env.SESSION_COOKIE];
    if (sessionId) await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    reply.clearCookie(env.SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
