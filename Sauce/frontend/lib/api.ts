/**
 * Cliente del backend.
 *
 * Todas las peticiones llevan `credentials: "include"` porque la sesion vive en
 * una cookie httpOnly. Es a proposito: un token en localStorage lo puede leer
 * cualquier script inyectado, y esta app carga imagenes y metadatos de terceros.
 *
 * El frontend se exporta estatico (`output: "export"`), asi que no hay servidor de
 * Next: todo esto corre en el navegador y habla con el backend por CORS.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    // El backend siempre responde JSON con { error, message }; si no, algo se
    // rompio antes de llegar a la app (proxy, CORS, 502).
    const body = await response.json().catch(() => null);

    throw new ApiError(
      response.status,
      body?.error ?? "unknown",
      body?.message ?? `Error ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

// ------------------------------------------------------------------- tipos

export interface ApiWork {
  slug: string;
  contentId: string | null;
  title: string;
  description: string;
  category: string;
  coverUrl: string;
  priceMinor: number;
  priceCurrency: string;
  creatorHandle: string;
  creatorName: string;
  publishedAt: string | null;
  owned?: boolean;
}

export interface ApiVoucher {
  orderId: string;
  to: string;
  contentId: string;
  amount: string;
  expiry: string;
  signature: string;
  redeemedAt: string | null;
  cancelledAt: string | null;
}

export interface ApiOrder {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  currency: string;
  amountMinor: number;
  usdcAmount: number;
  slug: string;
  title: string;
  createdAt: string;
  paidAt: string | null;
}

export interface LibraryItem {
  slug: string;
  title: string;
  coverUrl: string;
  category: string;
  contentId: string | null;
  creatorHandle: string;
  creatorName: string;
  acquiredAt: string;
  source: string;
  orderId: string | null;
  onchainClaimed: boolean;
}

// ------------------------------------------------------------------- rutas

export const api = {
  auth: {
    nonce: () => request<{ nonce: string; domain: string }>("/api/auth/nonce"),

    verify: (address: string, nonce: string, signature: string) =>
      request<{ address: string }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ address, nonce, signature }),
      }),

    me: () => request<{ authenticated: boolean; address?: string }>("/api/auth/me"),

    logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  },

  works: {
    list: (params: { category?: string; q?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.category) search.set("category", params.category);
      if (params.q) search.set("q", params.q);
      const qs = search.toString();

      return request<{ works: ApiWork[] }>(`/api/works${qs ? `?${qs}` : ""}`);
    },

    get: (slug: string) => request<{ work: ApiWork }>(`/api/works/${slug}`),

    access: (slug: string) =>
      request<{ url: string; expiresAt: number }>(`/api/works/${slug}/access`, { method: "POST" }),
  },

  creators: {
    get: (handle: string) =>
      request<{ creator: Record<string, unknown>; works: ApiWork[] }>(`/api/creators/${handle}`),

    register: (input: { handle: string; name: string; bio?: string; payoutAddress?: string }) =>
      request<{ creator: Record<string, unknown> }>("/api/creators", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  checkout: {
    /**
     * `idempotencyKey` la genera el cliente y se reutiliza si el usuario reintenta.
     * Es lo que hace que un doble clic devuelva la misma orden en vez de crear dos.
     */
    start: (slug: string, idempotencyKey: string) =>
      request<{
        orderId: string;
        redirectUrl: string;
        amountMinor: number;
        currency: string;
        usdcAmount: number;
        fxRate: number;
        deduplicated?: boolean;
      }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ slug, idempotencyKey }),
      }),
  },

  orders: {
    get: (id: string) =>
      request<{ order: ApiOrder; voucher: ApiVoucher | null }>(`/api/orders/${id}`),

    markRedeemed: (id: string, txHash: string) =>
      request<{ recorded: boolean }>(`/api/orders/${id}/redeemed`, {
        method: "POST",
        body: JSON.stringify({ txHash }),
      }),
  },

  library: {
    list: () => request<{ items: LibraryItem[] }>("/api/library"),
  },
};

/** Formatea un importe en unidades minimas (3800 PEN -> "S/ 38.00"). */
export function formatMinor(minor: number, currency: string): string {
  const symbol = currency === "PEN" ? "S/" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol} ${(minor / 100).toFixed(2)}`;
}
