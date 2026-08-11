import { randomBytes } from "node:crypto";
import { verifyMessage } from "viem";
import type { Address } from "viem";
import type { Db, Queryable } from "../db.js";
import { env } from "../env.js";
import { badRequest, unauthorized } from "./errors.js";

/**
 * Autenticacion con firma de wallet (SIWE simplificado).
 *
 * Se eligio esto en vez de usuario y contrasena porque el usuario ya necesita una
 * wallet para canjear el voucher, y porque no guardar contrasenas es no tener que
 * protegerlas. El servidor emite un nonce, el navegador lo firma, el servidor
 * verifica y abre sesion.
 */

export function buildSiweMessage(address: string, nonce: string, domainName: string): string {
  return [
    `${domainName} quiere que inicies sesion con tu wallet.`,
    "",
    `Direccion: ${address}`,
    `Nonce: ${nonce}`,
    "",
    "Firmar no cuesta gas y no autoriza ninguna transaccion.",
  ].join("\n");
}

export async function issueNonce(db: Db): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  await db.query("INSERT INTO siwe_nonces (nonce) VALUES ($1)", [nonce]);
  return nonce;
}

export async function consumeNonce(db: Db, nonce: string): Promise<void> {
  // UPDATE ... WHERE used_at IS NULL devuelve 0 filas si otra peticion llego
  // primero. Es lo que impide reusar una firma capturada.
  const { rowCount } = await db.query(
    `UPDATE siwe_nonces
        SET used_at = now()
      WHERE nonce = $1
        AND used_at IS NULL
        AND issued_at > now() - interval '10 minutes'`,
    [nonce],
  );

  if (!rowCount) throw badRequest("bad_nonce", "Nonce invalido, usado o vencido");
}

export async function verifySignature(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    return await verifyMessage({
      address: address as Address,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export async function upsertUser(db: Db, wallet: string): Promise<string> {
  // ON CONFLICT en vez de "SELECT y si no existe INSERT": dos pestanas
  // autenticandose a la vez no crean dos usuarios.
  //
  // El predicado `WHERE wallet IS NOT NULL` no es decorativo: desde la migracion
  // 004 el indice unico es parcial, y Postgres solo lo usa para inferir el
  // conflicto si el ON CONFLICT repite exactamente el mismo predicado. Sin el
  // falla con 42P10 y el login por wallet deja de funcionar.
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (wallet) VALUES ($1)
     ON CONFLICT (lower(wallet)) WHERE wallet IS NOT NULL
     DO UPDATE SET wallet = EXCLUDED.wallet
     RETURNING id`,
    [wallet.toLowerCase()],
  );

  return rows[0]!.id;
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const id = randomBytes(32).toString("hex");

  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [id, userId, env.SESSION_TTL_HOURS],
  );

  return id;
}

export interface SessionUser {
  userId: string;
  wallet: string;
}

export async function resolveSession(db: Queryable, sessionId?: string): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const { rows } = await db.query<{ user_id: string; wallet: string }>(
    `SELECT s.user_id, u.wallet
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );

  const row = rows[0];
  return row ? { userId: row.user_id, wallet: row.wallet } : null;
}

export function requireSession(user: SessionUser | null): SessionUser {
  if (!user) throw unauthorized();
  return user;
}
