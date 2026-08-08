import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { env } from "../env.js";

/**
 * Almacenamiento de archivos.
 *
 * Dos drivers detrás de la misma interfaz:
 *
 *   local  →  disco, para desarrollo y pruebas. El "prefirmado" es un HMAC que
 *             valida el propio backend en un PUT. Imita el flujo real de punta a
 *             punta, así que lo que se prueba en local es la misma conversación
 *             que en producción.
 *   s3     →  Cloudflare R2 o AWS S3. R2 es compatible con la API de S3, así que
 *             el mismo código sirve para ambos cambiando el endpoint.
 *
 * Se recomienda R2: no cobra tráfico de salida, y en una tienda de descargas ese
 * es el grueso de la factura.
 */

export interface PresignedUpload {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: number;
}

export interface StorageDriver {
  readonly name: string;
  presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload>;
  presignDownload(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  /** SHA-256 del objeto ya almacenado. `null` si el driver no puede calcularlo. */
  checksum(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}

// ------------------------------------------------------------------- local

const LOCAL_ROOT = resolve(env.STORAGE_LOCAL_DIR);

function sign(payload: string): string {
  return createHmac("sha256", env.GATEWAY_WEBHOOK_SECRET).update(payload).digest("hex");
}

export function verifyStorageSignature(key: string, expires: string, signature: string): boolean {
  if (Number(expires) * 1000 < Date.now()) return false;

  const expected = Buffer.from(sign(`${key}:${expires}`), "utf8");
  const received = Buffer.from(signature, "utf8");

  // Longitudes distintas hacen que timingSafeEqual lance en vez de devolver false.
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

/** Impide que una clave con `../` escriba fuera del directorio de almacenamiento. */
function localPath(key: string): string {
  const full = resolve(join(LOCAL_ROOT, key));

  if (!full.startsWith(LOCAL_ROOT + "/") && full !== LOCAL_ROOT) {
    throw new Error(`Clave de almacenamiento fuera de rango: ${key}`);
  }

  return full;
}

export const localDriver: StorageDriver = {
  name: "local",

  async presignUpload(key, _mimeType, _sizeBytes) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const signature = sign(`${key}:${expires}`);

    return {
      url: `${env.PUBLIC_API_URL}/api/uploads/data/${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`,
      method: "PUT",
      headers: {},
      expiresAt: expires,
    };
  },

  async presignDownload(key, ttlSeconds) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = sign(`${key}:${expires}`);

    return `${env.PUBLIC_API_URL}/api/uploads/data/${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`;
  },

  async head(key) {
    try {
      const info = await stat(localPath(key));
      return { size: info.size };
    } catch {
      return null;
    }
  },

  async checksum(key) {
    try {
      const hash = createHash("sha256");
      await pipeline(createReadStream(localPath(key)), hash);
      return hash.digest("hex");
    } catch {
      return null;
    }
  },

  async remove(key) {
    await unlink(localPath(key)).catch(() => undefined);
  },
};

/** Escribe un flujo entrante en disco. Solo lo usa el driver local. */
export async function writeLocalObject(key: string, source: Readable): Promise<number> {
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await pipeline(source, createWriteStream(path));

  const info = await stat(path);
  return info.size;
}

// ---------------------------------------------------------------------- s3

/**
 * Driver S3/R2.
 *
 * Se carga de forma perezosa para que el SDK de AWS no entre en el arranque
 * cuando se trabaja en local, que es la mayor parte del tiempo.
 *
 * Nota sobre integridad: el servidor no puede recalcular el SHA-256 de un objeto
 * de varios GB sin descargarlo entero. La solución correcta es pedir el checksum
 * en la propia petición prefirmada (`ChecksumSHA256`), y que S3 rechace la subida
 * si no coincide. Así la verificación la hace el almacenamiento, no nosotros.
 */
export async function createS3Driver(): Promise<StorageDriver> {
  const { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    },
    // R2 exige estilo de ruta; S3 lo tolera.
    forcePathStyle: Boolean(env.S3_ENDPOINT),
  });

  const bucket = env.S3_BUCKET;

  return {
    name: "s3",

    async presignUpload(key, mimeType, sizeBytes) {
      const ttl = 3600;

      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: mimeType,
          ContentLength: sizeBytes,
          ChecksumAlgorithm: "SHA256",
        }),
        { expiresIn: ttl },
      );

      return {
        url,
        method: "PUT",
        headers: { "Content-Type": mimeType },
        expiresAt: Math.floor(Date.now() / 1000) + ttl,
      };
    },

    async presignDownload(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },

    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: Number(out.ContentLength ?? 0) };
      } catch {
        return null;
      }
    },

    // Descargar GB para hashear no es viable: lo valida S3 con ChecksumSHA256.
    async checksum() {
      return null;
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

let cached: StorageDriver | null = null;

export async function storage(): Promise<StorageDriver> {
  if (cached) return cached;

  cached = env.STORAGE_DRIVER === "s3" ? await createS3Driver() : localDriver;

  return cached;
}

/**
 * Genera la clave del objeto.
 *
 * Lleva el id de la subida, así que dos archivos con el mismo nombre nunca chocan
 * y el nombre original del usuario no acaba en la ruta pública.
 */
export function buildStorageKey(purpose: string, uploadId: string, filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase().slice(0, 8) : "bin";
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "bin";

  return `${purpose}/${uploadId}.${safeExt}`;
}
