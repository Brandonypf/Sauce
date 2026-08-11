import bcrypt from "bcryptjs";
import { env } from "../env.js";

/**
 * Hashing de contraseñas.
 *
 * Se usa `bcryptjs` y no `bcrypt`: el segundo compila código nativo, lo que
 * obliga a instalar toolchain en la imagen de Docker y rompe en Alpine. El coste
 * en velocidad es real pero irrelevante aquí — bcrypt está pensado para ser lento
 * a propósito, y unos milisegundos de más no cambian nada.
 */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Compara contra un hash falso cuando el usuario no existe.
 *
 * Sin esto, un login con email inexistente responde en 1 ms y uno con email real
 * en 100 ms. Esa diferencia permite enumerar qué correos están registrados sin
 * acertar ni una contraseña.
 */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function wastePasswordTime(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}
