import { API_URL } from "@/lib/app-params";

/**
 * Cliente del backend de SAUCE.
 *
 * Este archivo reemplaza la capa de datos que Base44 dejó vacía. No habla con
 * Base44: habla con el backend Fastify + Postgres de este mismo repositorio,
 * que es donde viven las órdenes, las licencias y la llave que firma vouchers.
 *
 * `credentials: "include"` en todo porque la sesión es una cookie httpOnly.
 */

export class ApiError extends Error {
  constructor(status, code, message, issues = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;

    // Detalle de validacion de zod: [{ path, message }]. Sin esto, una
    // contrasena de 8 caracteres solo produce "Datos invalidos" y el usuario no
    // tiene forma de saber que le falta.
    this.issues = issues;
  }

  /** Mensaje pensado para mostrar en pantalla, no para el log. */
  get displayMessage() {
    if (this.issues?.length) {
      return this.issues.map((i) => i.message).join(". ");
    }

    return this.message;
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new ApiError(
      response.status,
      body?.error ?? "unknown",
      body?.message ?? `Error ${response.status}`,
      body?.issues ?? [],
    );
  }

  return response.json();
}

export const api = {
  auth: {
    register: (input) =>
      request("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),

    login: (input) =>
      request("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),

    linkWallet: (address, nonce, signature) =>
      request("/api/auth/link-wallet", {
        method: "POST",
        body: JSON.stringify({ address, nonce, signature }),
      }),

    nonce: () => request("/api/auth/nonce"),

    verify: (address, nonce, signature) =>
      request("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ address, nonce, signature }),
      }),

    me: () => request("/api/auth/me"),

    logout: () =>
      request("/api/auth/logout", {
        method: "POST",
      }),
  },

  works: {
    list: ({ format, genre, q, limit = 24, offset = 0 } = {}) => {
      const search = new URLSearchParams();

      if (format) search.set("format", format);
      if (genre) search.set("genre", genre);
      if (q) search.set("q", q);

      search.set("limit", String(limit));
      search.set("offset", String(offset));

      return request(`/api/works?${search}`);
    },

    get: (slug) =>
      request(`/api/works/${slug}`),

    access: (slug) =>
      request(`/api/works/${slug}/access`, {
        method: "POST",
      }),

    chapters: (slug) =>
      request(`/api/works/${slug}/chapters`),

    releases: (slug) =>
      request(`/api/works/${slug}/releases`),
  },

  creators: {
    get: (handle) =>
      request(`/api/creators/${handle}`),

    register: (input) =>
      request("/api/creators", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    myWorks: () =>
      request("/api/creators/me/works"),

    publish: (input) =>
      request("/api/works", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

checkout: {
  start: (slug, idempotencyKey) =>
    request("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ slug, idempotencyKey }),
    }),
},

dev: {
  pay: (orderId) =>
    request(`/api/dev/pay/${orderId}`, {
      method: "POST",
    }),
},

orders: {
  get: (id) => request(`/api/orders/${id}`),
  markRedeemed: (id, txHash) =>
    request(`/api/orders/${id}/redeemed`, {
      method: "POST",
      body: JSON.stringify({ txHash }),
    }),
},
  library: {
    list: () =>
      request("/api/library"),
  },

  uploads: {
    create: (input) =>
      request("/api/uploads", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    complete: (id, checksum) =>
      request(`/api/uploads/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ checksum }),
      }),

    abort: (id) =>
      request(`/api/uploads/${id}/abort`, {
        method: "POST",
      }),
  },

  genres: {
    list: (format) =>
      request(
        `/api/genres${format ? `?format=${format}` : ""}`,
      ),
  },
};

/**
 * 3800 → "S/ 38.00"
 */
export function formatMinor(minor, currency = "PEN") {
  const symbol =
    currency === "PEN"
      ? "S/"
      : currency === "USD"
        ? "$"
        : `${currency} `;

  return `${symbol} ${(minor / 100).toFixed(2)}`;
}
