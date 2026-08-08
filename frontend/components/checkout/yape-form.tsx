"use client";

import * as React from "react";
import { Smartphone } from "lucide-react";

/**
 * Pago con Yape o Plin.
 *
 * Yape no tiene API pública directa: la integración a e-commerce va
 * obligatoriamente por una pasarela autorizada (Culqi, Izipay, Mercado Pago, PayU,
 * Alignet). Lo mismo con Plin.
 *
 * De todos los flujos disponibles, el de Izipay es el que mejor encaja en una
 * aplicación de escritorio: el usuario abre Yape, entra a Menú → "código de
 * aprobación", copia seis dígitos y los pega aquí. No hace falta escanear un QR
 * con un segundo dispositivo ni saltar del escritorio al teléfono y volver.
 *
 * El código NO se valida aquí. Se manda al backend, que consulta a la pasarela.
 * Un frontend que decida si un pago es válido es un frontend que cualquiera puede
 * convencer de que sí lo es.
 */

interface YapeFormProps {
  phone: string;
  code: string;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  disabled?: boolean;
}

export function YapeForm({
  phone,
  code,
  onPhoneChange,
  onCodeChange,
  disabled,
}: YapeFormProps) {
  return (
    <div className="space-y-5">
      <ol className="space-y-2 rounded-md border border-default bg-bg-surface/60 p-4">
        {[
          "Abre Yape en tu teléfono",
          'Entra a Menú → "Código de aprobación"',
          "Copia el código de 6 dígitos y pégalo aquí",
        ].map((paso, i) => (
          <li key={paso} className="flex gap-3 text-small text-text-secondary">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption text-accent">
              {i + 1}
            </span>
            {paso}
          </li>
        ))}
      </ol>

      <div className="space-y-1.5">
        <label htmlFor="yape-phone" className="text-caption text-text-tertiary">
          Celular afiliado a Yape
        </label>
        <div className="flex items-center gap-2 rounded-md border border-default bg-bg-surface px-3">
          <Smartphone className="h-4 w-4 text-text-tertiary" />
          <input
            id="yape-phone"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="9XX XXX XXX"
            value={phone}
            disabled={disabled}
            // Sin espacios ni prefijo: PayU documenta que un indicativo pegado al
            // número ("51969929157") hace que la transacción se pierda.
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className="w-full bg-transparent py-3 text-body text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="yape-code" className="text-caption text-text-tertiary">
          Código de aprobación
        </label>
        <input
          id="yape-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          disabled={disabled}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full rounded-md border border-default bg-bg-surface px-3 py-3 text-center font-mono text-h2 tracking-[0.35em] text-text-primary outline-none focus:border-focus"
        />
        <p className="text-caption text-text-tertiary">
          El código caduca a los pocos minutos. Si falla, genera uno nuevo en Yape.
        </p>
      </div>

      <p className="text-caption text-text-tertiary">
        Límite por operación: S/ 500. Tope diario según tu configuración en Yape.
      </p>
    </div>
  );
}
