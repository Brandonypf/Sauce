/** Métodos que expone el checkout. */
export type PaymentMethod = "yape" | "card" | "paypal" | "wallet";

/**
 * Estados del checkout.
 *
 * `redirecting` y `awaiting_confirmation` existen porque tres de los cuatro
 * métodos sacan al usuario de la aplicación. El spec original asumía que la
 * compra terminaba dentro del modal; en la vida real el usuario se va a PayPal o
 * a su wallet y vuelve — o no vuelve, y el webhook llega igual.
 */
export type CheckoutState =
  | "idle"
  | "validating"
  | "creating_order"
  | "redirecting"
  | "awaiting_confirmation"
  | "confirmed"
  | "error";

export interface CheckoutStep {
  id: string;
  label: string;
}

/** Los pasos que ve el usuario en el overlay de progreso. */
export const CHECKOUT_STEPS: CheckoutStep[] = [
  { id: "order", label: "Creando la orden" },
  { id: "payment", label: "Esperando el pago" },
  { id: "license", label: "Generando la licencia" },
  { id: "done", label: "Listo" },
];

export interface PaymentMethodMeta {
  id: PaymentMethod;
  label: string;
  hint: string;
  /** Si el pago ocurre fuera de la aplicación (navegador, app de terceros). */
  leavesApp: boolean;
  available: boolean;
}
