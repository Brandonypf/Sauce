"use client";

import { motion } from "framer-motion";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { CHECKOUT_STEPS, type CheckoutState } from "@/types/checkout";

/**
 * Overlay de progreso.
 *
 * El spec original tenía una barra que avanzaba sola por cuatro pasos, incluido
 * "Confirmando en blockchain". Eso pintaba una mentira: la licencia no depende de
 * ninguna transacción, y el pago no se confirma en el navegador sino cuando llega
 * el webhook de la pasarela — que puede tardar segundos o minutos, y puede llegar
 * después de que el usuario cierre la ventana.
 *
 * Así que el paso "Esperando el pago" se queda girando de verdad hasta que el
 * backend diga lo contrario. Una barra que avanza sin información real solo
 * consigue que el usuario cierre creyendo que terminó.
 */

const STATE_TO_STEP: Record<CheckoutState, number> = {
  idle: 0,
  validating: 0,
  creating_order: 0,
  redirecting: 1,
  awaiting_confirmation: 1,
  confirmed: 3,
  error: 1,
};

export function ProcessingOverlay({
  state,
  externalUrl,
}: {
  state: CheckoutState;
  externalUrl?: string | null;
}) {
  const current = STATE_TO_STEP[state];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 rounded-lg bg-bg-base/92 backdrop-blur-sm"
    >
      <ol className="w-full max-w-xs space-y-3">
        {CHECKOUT_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;

          return (
            <li key={step.id} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-success bg-success/20 text-success"
                    : active
                      ? "border-accent text-accent"
                      : "border-default text-text-tertiary"
                }`}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="text-caption">{i + 1}</span>
                )}
              </span>

              <span
                className={`text-small ${
                  done || active ? "text-text-primary" : "text-text-tertiary"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {state === "awaiting_confirmation" && (
        <div className="max-w-xs space-y-3 text-center">
          <p className="text-caption text-text-tertiary">
            Puedes cerrar esta ventana. La licencia aparecerá en tu biblioteca en
            cuanto el pago se confirme.
          </p>

          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-caption text-accent hover:text-accent-hover"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Volver a abrir la página de pago
            </a>
          )}
        </div>
      )}
    </motion.div>
  );
}
