"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { PurchasePanel } from "@/components/work/purchase-panel";
import { api, type ApiWork } from "@/lib/api";

/**
 * Puente entre la pagina estatica y el backend.
 *
 * La pagina de obra se prerenderiza en build (`output: "export"`), asi que el
 * precio y la propiedad no pueden venir del servidor de Next — no hay servidor.
 * Este componente pide la obra al backend en el cliente y, mientras llega, muestra
 * los datos del catalogo estatico para no dejar el hueco vacio.
 *
 * `fallback` son los datos del build. Si el backend no responde, la pagina sigue
 * siendo legible; simplemente no se puede comprar.
 */
export function PurchaseSection({ fallback }: { fallback: ApiWork }) {
  const [work, setWork] = React.useState<ApiWork>(fallback);
  const [loading, setLoading] = React.useState(true);
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    api.works
      .get(fallback.slug)
      .then(({ work: fresh }) => {
        if (!cancelled) setWork(fresh);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fallback.slug]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (offline) {
    return (
      <div className="rounded-md border border-default p-4">
        <p className="text-small text-text-secondary">
          No se pudo contactar el servidor. Recarga para intentar comprar.
        </p>
      </div>
    );
  }

  return <PurchasePanel work={work} />;
}
