"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";

/**
 * Pago con tarjeta.
 *
 * El spec original pedía inputs propios para número, titular, vencimiento y CVV.
 * Eso no se puede construir: en cuanto el número de tarjeta pasa por tu DOM entras
 * en alcance PCI DSS SAQ-D. La documentación de Culqi lo dice explícitamente —
 * interactuar directamente con su API obliga a cumplir PCI DSS 3.2 y enviarles el
 * formulario SAQ-D firmado.
 *
 * Lo que sí se puede: la pasarela monta sus propios campos dentro de un iframe
 * (hosted fields), tú los envuelves visualmente y nunca ves el número. Este
 * componente reserva ese hueco y monta la tarjeta animada alrededor.
 *
 * La tarjeta visual sobrevive entera. Solo cambia de dónde saca los datos: en vez
 * de leer lo que el usuario teclea, se pinta con lo que el iframe reporta —marca,
 * últimos cuatro dígitos, vencimiento—, que es información no sensible.
 */

interface CardFormProps {
  /** Marca detectada por la pasarela (visa, mastercard, amex...). */
  brand?: string;
  /** Últimos cuatro dígitos. Nunca el número completo. */
  last4?: string;
  expiry?: string;
  holder?: string;
  /** Cuando el CVV tiene el foco, la tarjeta gira. Lo reporta el iframe. */
  cvvFocused?: boolean;
}

export function CardForm({
  brand,
  last4,
  expiry,
  holder,
  cvvFocused = false,
}: CardFormProps) {
  return (
    <div className="space-y-5">
      <VisualCard
        brand={brand}
        last4={last4}
        expiry={expiry}
        holder={holder}
        flipped={cvvFocused}
      />

      {/*
        Aquí monta la pasarela sus campos. Culqi usa `Culqi.createToken()` sobre un
        iframe; Izipay y Mercado Pago tienen equivalentes. El div existe para que
        el SDK tenga dónde inyectarse cuando se elija proveedor.
      */}
      <div
        id="gateway-hosted-fields"
        className="min-h-[168px] rounded-md border border-dashed border-default bg-bg-surface/60 p-4"
      >
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
          <div>
            <p className="text-small text-text-secondary">
              Campos seguros de la pasarela
            </p>
            <p className="mt-1 text-caption text-text-tertiary">
              El número de tarjeta se escribe dentro de un iframe de la pasarela y
              nunca pasa por esta aplicación. Pendiente de montar hasta elegir
              proveedor: Culqi, Izipay o Mercado Pago.
            </p>
          </div>
        </div>
      </div>

      <p className="flex items-center gap-2 text-caption text-text-tertiary">
        <ShieldCheck className="h-3.5 w-3.5" />
        SAUCE no almacena ni recibe los datos de tu tarjeta
      </p>
    </div>
  );
}

function VisualCard({
  brand,
  last4,
  expiry,
  holder,
  flipped,
}: {
  brand?: string;
  last4?: string;
  expiry?: string;
  holder?: string;
  flipped: boolean;
}) {
  return (
    <div className="[perspective:1200px]">
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-48 w-full [transform-style:preserve-3d]"
      >
        {/* Frente */}
        <div className="glass absolute inset-0 flex flex-col justify-between rounded-lg p-5 [backface-visibility:hidden]">
          <div className="flex items-start justify-between">
            <CreditCard className="h-6 w-6 text-text-secondary" />
            <span className="text-caption uppercase tracking-widest text-text-tertiary">
              {brand ?? "tarjeta"}
            </span>
          </div>

          <p className="font-mono text-h3 tracking-[0.18em] text-text-primary">
            {last4 ? `•••• •••• •••• ${last4}` : "•••• •••• •••• ••••"}
          </p>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-caption uppercase tracking-wide text-text-tertiary">
                Titular
              </p>
              <p className="text-small text-text-primary">
                {holder || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption uppercase tracking-wide text-text-tertiary">
                Vence
              </p>
              <p className="text-small text-text-primary">{expiry || "••/••"}</p>
            </div>
          </div>
        </div>

        {/* Reverso */}
        <div className="glass absolute inset-0 rounded-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="mt-6 h-10 w-full bg-black/50" />
          <div className="mt-6 px-5">
            <div className="flex h-9 items-center justify-end rounded-sm bg-white/85 px-3">
              <span className="font-mono text-small tracking-widest text-black/70">
                •••
              </span>
            </div>
            <p className="mt-3 text-caption text-text-tertiary">
              El CVV se escribe en el campo seguro de la pasarela.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
