import { useCallback, useState } from "react";
import { api } from "@/api/client";

/**
 * Subida de archivos en tres pasos.
 *
 *   1. hash local  → SHA-256 con crypto.subtle, antes de transferir nada
 *   2. reservar    → el backend devuelve una URL prefirmada
 *   3. subir       → XHR directo al almacenamiento, sin pasar por la API
 *
 * El hash se calcula primero por dos motivos. Si el archivo ya está en el
 * almacén, el backend lo dice y no se transfiere nada — con novelas visuales de
 * varios GB eso ahorra minutos reales. Y ese mismo hash acaba siendo el
 * `contentHash` de la atestación on-chain, así que tiene que salir del archivo,
 * no de lo que diga el cliente después.
 *
 * Se usa XMLHttpRequest y no fetch porque fetch no reporta progreso de subida.
 * Sin barra de progreso, una transferencia de 2 GB parece un cuelgue.
 */
export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);

  const reset = useCallback(() => {
    setProgress(0);
    setPhase("idle");
    setError(null);
  }, []);

  const upload = useCallback(async (file, purpose = "content") => {
    setError(null);
    setProgress(0);

    try {
      setPhase("hashing");
      const checksum = await hashFile(file, setProgress);

      setPhase("reserving");
      setProgress(0);

      const reserved = await api.uploads.create({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        checksum,
        purpose,
      });

      // El archivo ya existía: nada que transferir.
      if (reserved.deduplicated) {
        setPhase("done");
        setProgress(100);
        return { uploadId: reserved.uploadId, checksum, deduplicated: true };
      }

      setPhase("uploading");
      await putWithProgress(reserved.upload, file, setProgress);

      setPhase("verifying");
      await api.uploads.complete(reserved.uploadId, checksum);

      setPhase("done");
      setProgress(100);

      return { uploadId: reserved.uploadId, checksum, deduplicated: false };
    } catch (e) {
      setPhase("error");
      setError(e?.message ?? "No se pudo subir el archivo");
      throw e;
    }
  }, []);

  return { upload, progress, phase, error, reset };
}

/**
 * SHA-256 por trozos.
 *
 * `crypto.subtle.digest` exige el archivo entero en memoria, lo que revienta el
 * navegador con un archivo de 2 GB. Esto lo lee en bloques de 8 MB con una
 * implementación incremental.
 */
async function hashFile(file, onProgress) {
  const CHUNK = 8 * 1024 * 1024;

  // Archivos pequeños: una sola pasada con la API nativa, que es más rápida.
  if (file.size <= CHUNK) {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    onProgress?.(100);
    return toHex(digest);
  }

  const hasher = await createIncrementalSha256();
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK);
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
    offset += CHUNK;
    onProgress?.(Math.round((offset / file.size) * 100));
  }

  return hasher.hex();
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 incremental en JavaScript puro.
 *
 * La Web Crypto API no ofrece hashing por bloques — solo `digest()` de una vez.
 * Para archivos grandes no queda otra que implementarlo.
 */
async function createIncrementalSha256() {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  let h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  let buffer = new Uint8Array(0);
  let total = 0;

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function compress(block) {
    const w = new Uint32Array(64);

    for (let i = 0; i < 16; i++) {
      w[i] =
        (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }

    h = new Uint32Array([
      (h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0,
      (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0,
    ]);
  }

  return {
    update(bytes) {
      total += bytes.length;

      const merged = new Uint8Array(buffer.length + bytes.length);
      merged.set(buffer);
      merged.set(bytes, buffer.length);

      let offset = 0;
      while (merged.length - offset >= 64) {
        compress(merged.subarray(offset, offset + 64));
        offset += 64;
      }

      buffer = merged.subarray(offset);
    },

    hex() {
      const bitLength = total * 8;
      const padLength = buffer.length < 56 ? 56 - buffer.length : 120 - buffer.length;

      const tail = new Uint8Array(buffer.length + padLength + 8);
      tail.set(buffer);
      tail[buffer.length] = 0x80;

      // Longitud en bits, big endian, 64 bits. Se usa BigInt porque un archivo
      // de más de 512 MB ya desborda los 32 bits de un entero de JavaScript.
      const view = new DataView(tail.buffer);
      view.setBigUint64(tail.length - 8, BigInt(bitLength));

      for (let i = 0; i < tail.length; i += 64) {
        compress(tail.subarray(i, i + 64));
      }

      return Array.from(h)
        .map((x) => x.toString(16).padStart(8, "0"))
        .join("");
    },
  };
}

/** PUT con progreso real. `fetch` no lo reporta; XHR sí. */
function putWithProgress(presigned, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(presigned.method ?? "PUT", presigned.url, true);

    for (const [key, value] of Object.entries(presigned.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`El almacenamiento respondió ${xhr.status}`));

    xhr.onerror = () => reject(new Error("Se cortó la conexión durante la subida"));
    xhr.onabort = () => reject(new Error("Subida cancelada"));

    xhr.send(file);
  });
}
