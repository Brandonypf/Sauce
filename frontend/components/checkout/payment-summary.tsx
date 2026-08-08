"use client";

import Image from "next/image";
import { formatMinor, type ApiWork } from "@/lib/api";

/**
 * Resumen lateral.
 *
 * El precio que se muestra viene del backend, no de props del catálogo estático.
 * Si el frontend pudiera decidir el monto, cambiarlo sería trivial desde la
 * consola; el backend recalcula el precio en `POST /api/checkout` y el importe que
 * se cobra es siempre el suyo.
 */
export function PaymentSummary({
  work,
  usdcAmount,
  fxRate,
}: {
  work: ApiWork;
  usdcAmount?: number;
  fxRate?: number;
}) {
  const total = formatMinor(work.priceMinor, work.priceCurrency);

  return (
    <aside className="space-y-4 rounded-md border border-default bg-bg-surface/60 p-5">
      <div className="flex gap-3">
        {work.coverUrl && (
          <Image
            src={work.coverUrl}
            alt={work.title}
            width={72}
            height={96}
            className="h-24 w-[72px] rounded-sm object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{work.title}</p>
          <p className="truncate text-caption text-text-tertiary">{work.creatorName}</p>
        </div>
      </div>

      <dl className="space-y-2 border-t border-default pt-4 text-small">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd className="text-text-primary">{total}</dd>
        </div>

        {usdcAmount != null && fxRate != null && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Equivalente</dt>
            <dd className="text-text-tertiary">
              {(usdcAmount / 1_000_000).toFixed(2)} USDC
            </dd>
          </div>
        )}

        <div className="flex justify-between border-t border-default pt-2 text-body">
          <dt className="font-medium text-text-primary">Total</dt>
          <dd className="font-medium text-text-primary">{total}</dd>
        </div>
      </dl>

      {fxRate != null && (
        <p className="text-caption text-text-tertiary">
          Tipo de cambio fijado al abrir la orden ({fxRate}). No se recalcula al
          liquidar.
        </p>
      )}
    </aside>
  );
}
