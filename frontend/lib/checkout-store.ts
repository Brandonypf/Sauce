"use client";

import { create } from "zustand";
import type { CheckoutState, PaymentMethod } from "@/types/checkout";

/**
 * Estado del modal de checkout.
 *
 * Solo estado de interfaz: qué pestaña está abierta, en qué paso vamos, si hubo
 * error. Nada de propiedad ni de "ya pagó" — eso lo decide el backend y se
 * consulta con `GET /api/orders/:id`. Un store que recuerde "pagado" es un store
 * que alguien puede editar desde la consola.
 */
interface CheckoutStoreState {
  open: boolean;
  slug: string | null;
  method: PaymentMethod;
  state: CheckoutState;
  orderId: string | null;
  error: string | null;

  /** Se genera una vez por apertura del modal y se reutiliza en los reintentos. */
  idempotencyKey: string | null;

  openFor: (slug: string) => void;
  close: () => void;
  setMethod: (method: PaymentMethod) => void;
  setState: (state: CheckoutState) => void;
  setOrder: (orderId: string) => void;
  fail: (message: string) => void;
  retry: () => void;
}

export const useCheckoutStore = create<CheckoutStoreState>()((set, get) => ({
  open: false,
  slug: null,
  method: "yape",
  state: "idle",
  orderId: null,
  error: null,
  idempotencyKey: null,

  openFor: (slug) =>
    set({
      open: true,
      slug,
      state: "idle",
      orderId: null,
      error: null,
      // Clave nueva por apertura: si el usuario cierra y vuelve a abrir es una
      // intención de compra distinta. Dentro de la misma apertura se reutiliza,
      // que es lo que hace que el doble clic no cree dos órdenes.
      idempotencyKey: crypto.randomUUID(),
    }),

  close: () => set({ open: false }),

  setMethod: (method) => set({ method, error: null }),
  setState: (state) => set({ state }),
  setOrder: (orderId) => set({ orderId }),

  fail: (message) => set({ state: "error", error: message }),

  // El reintento conserva orderId e idempotencyKey a propósito: si la orden ya
  // existe, volver a intentarlo debe reutilizarla, no abrir otra.
  retry: () => set({ state: "idle", error: null, idempotencyKey: get().idempotencyKey }),
}));
