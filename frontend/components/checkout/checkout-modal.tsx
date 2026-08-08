"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCard, Smartphone, Wallet, X } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useLibraryStore } from "@/lib/store";
import { useCheckoutStore } from "@/lib/checkout-store";
import { api, ApiError, formatMinor, type ApiWork } from "@/lib/api";
import type { PaymentMethod, PaymentMethodMeta } from "@/types/checkout";

import { CardForm } from "./card-form";
import { YapeForm } from "./yape-form";
import { PaymentSummary } from "./payment-summary";
import { ProcessingOverlay } from "./processing-overlay";
import { SuccessView } from "./success-view";

/**
 * Modal de checkout.
 *
 * Diferencia principal con el spec original: aquí no se simula nada. `POST
 * /api/checkout` crea una orden PENDING real en el backend, y la licencia solo
 * aparece cuando el webhook de la pasarela confirma el pago.
 *
 * Eso cambia la forma de la interfaz. No hay un spinner que termine en éxito a los
 * tres segundos: el usuario se va a pagar —a PayPal, a su wallet, a la app de
 * Yape— y vuelve, o no vuelve. Por eso el modal se queda consultando la orden y
 * dice explícitamente que se puede cerrar.
 */

const METHODS: PaymentMethodMeta[] = [
  {
    id: "yape",
    label: "Yape / Plin",
    hint: "Código de aprobación desde tu app",
    leavesApp: false,
    available: true,
  },
  {
    id: "card",
    label: "Tarjeta",
    hint: "Campos seguros de la pasarela",
    leavesApp: false,
    available: true,
  },
  {
    id: "paypal",
    label: "PayPal",
    hint: "Se abre en tu navegador",
    leavesApp: true,
    available: true,
  },
  {
    id: "wallet",
    label: "Wallet",
    hint: "USDC en Arbitrum",
    leavesApp: true,
    available: true,
  },
];

const ICONS: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  yape: Smartphone,
  card: CreditCard,
  paypal: CreditCard,
  wallet: Wallet,
};

export function CheckoutModal({ work }: { work: ApiWork }) {
  const { open, method, state, orderId, error, idempotencyKey, close, setMethod, setState, setOrder, fail, retry } =
    useCheckoutStore();

  const { isConnected, authenticated, signIn, signingIn } = useSession();
  const { openConnectModal } = useConnectModal();
  const markOwned = useLibraryStore((s) => s.markOwned);

  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [redirectUrl, setRedirectUrl] = React.useState<string | null>(null);
  const [quote, setQuote] = React.useState<{ usdcAmount: number; fxRate: number } | null>(null);

  // Consulta la orden hasta que el backend la marque como pagada. El webhook puede
  // llegar en cualquier momento, así que no sirve un único fetch al volver.
  React.useEffect(() => {
    if (state !== "awaiting_confirmation" || !orderId) return;

    let cancelled = false;
    let delay = 1500;

    const tick = async () => {
      if (cancelled) return;

      try {
        const { order } = await api.orders.get(orderId);

        if (order.status === "paid") {
          markOwned(work.slug);
          setState("confirmed");
          return;
        }

        if (order.status === "failed" || order.status === "refunded") {
          fail("El pago no se completó. Puedes intentarlo de nuevo.");
          return;
        }
      } catch {
        // Un fallo de red no debe romper el checkout: se reintenta más lento.
      }

      // Backoff hasta 8s: la mayoría de webhooks llegan en segundos, pero una
      // transferencia puede tardar. Consultar cada segundo durante minutos es
      // castigar al backend por la lentitud de la pasarela.
      delay = Math.min(delay * 1.4, 8000);
      setTimeout(tick, delay);
    };

    const id = setTimeout(tick, delay);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [state, orderId, work.slug, markOwned, setState, fail]);

  if (!open) return null;

  const start = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!authenticated) {
      try {
        await signIn();
      } catch {
        fail("No se pudo iniciar sesión con tu wallet");
        return;
      }
    }

    setState("creating_order");

    try {
      const checkout = await api.checkout.start(work.slug, idempotencyKey ?? crypto.randomUUID());

      setOrder(checkout.orderId);
      setQuote({ usdcAmount: checkout.usdcAmount, fxRate: checkout.fxRate });
      setRedirectUrl(checkout.redirectUrl);

      if (METHODS.find((m) => m.id === method)?.leavesApp) {
        setState("redirecting");
        // En Electron esto debe ser `shell.openExternal`, no una navegación: el
        // usuario tiene que volver a la aplicación, y una wallet o PayPal dentro
        // del renderer no es un entorno en el que se deba pedir credenciales.
        window.open(checkout.redirectUrl, "_blank", "noopener,noreferrer");
      }

      setState("awaiting_confirmation");
    } catch (e) {
      if (e instanceof ApiError && e.code === "already_owned") {
        markOwned(work.slug);
        setState("confirmed");
        return;
      }

      fail(e instanceof ApiError ? e.message : "No se pudo iniciar la compra");
    }
  };

  const busy = state === "creating_order" || state === "redirecting" || state === "awaiting_confirmation";
  const price = formatMinor(work.priceMinor, work.priceCurrency);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={close}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-default bg-bg-base shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-default px-6 py-4">
            <h2 className="text-h3 font-medium text-text-primary">Finalizar compra</h2>
            <button
              onClick={close}
              aria-label="Cerrar"
              className="rounded-sm p-1 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {state === "confirmed" ? (
            <SuccessView title={work.title} orderId={orderId} onClose={close} />
          ) : (
            <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_280px]">
              <AnimatePresence>
                {busy && <ProcessingOverlay state={state} externalUrl={redirectUrl} />}
              </AnimatePresence>

              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {METHODS.map((m) => {
                    const Icon = ICONS[m.id];
                    const selected = method === m.id;

                    return (
                      <button
                        key={m.id}
                        onClick={() => setMethod(m.id)}
                        disabled={busy}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-small transition-colors ${
                          selected
                            ? "border-focus bg-accent-soft text-text-primary"
                            : "border-default text-text-secondary hover:border-hover"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <p className="text-caption text-text-tertiary">
                  {METHODS.find((m) => m.id === method)?.hint}
                </p>

                {method === "yape" && (
                  <YapeForm
                    phone={phone}
                    code={code}
                    onPhoneChange={setPhone}
                    onCodeChange={setCode}
                    disabled={busy}
                  />
                )}

                {method === "card" && <CardForm />}

                {(method === "paypal" || method === "wallet") && (
                  <div className="rounded-md border border-default bg-bg-surface/60 p-4">
                    <p className="text-small text-text-secondary">
                      {method === "paypal"
                        ? "Se abrirá PayPal en tu navegador. Vuelve a esta ventana cuando termines."
                        : "Se abrirá el checkout de wallet en tu navegador para firmar la transferencia en USDC."}
                    </p>
                    <p className="mt-2 text-caption text-text-tertiary">
                      El pago se confirma en nuestro servidor, no en tu navegador.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-danger/40 bg-danger/10 p-3">
                    <p className="text-small text-danger">{error}</p>
                    <button
                      onClick={retry}
                      className="mt-2 text-caption text-text-secondary underline hover:text-text-primary"
                    >
                      Reintentar
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <PaymentSummary
                  work={work}
                  usdcAmount={quote?.usdcAmount}
                  fxRate={quote?.fxRate}
                />

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void start()}
                  loading={busy || signingIn}
                  disabled={method === "yape" && code.length < 6}
                >
                  {isConnected ? `Pagar ${price}` : "Conecta tu wallet"}
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
