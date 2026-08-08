"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api, ApiError, formatMinor, type ApiOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Pasarela de pago simulada.
 *
 * Existe para que el flujo completo se pueda recorrer en local sin cuenta de
 * Stripe ni de Mercado Pago. Ocupa el lugar exacto de la pasarela real: el usuario
 * llega aqui por redireccion desde `/api/checkout` y vuelve a la aplicacion
 * despues.
 *
 * Lo que esta pagina NO hace, a proposito: confirmar el pago. El boton solo pide
 * al backend que se envie el webhook, igual que haria la pasarela de verdad. La
 * licencia la emite el webhook, no el navegador. Si el frontend pudiera confirmar
 * pagos, cualquiera se regalaria el catalogo con una peticion desde la consola.
 */
export default function MockCheckoutPage() {
  const [order, setOrder] = React.useState<ApiOrder | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [orderId, setOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");

    if (!id) {
      setError("Falta el identificador de orden");
      return;
    }

    setOrderId(id);

    api.orders
      .get(id)
      .then(({ order: fetched }) => setOrder(fetched))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la orden"));
  }, []);

  const pay = async () => {
    if (!orderId) return;
    setPaying(true);

    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

      // En desarrollo el backend expone este atajo, que firma y se entrega el
      // webhook a si mismo. En produccion no existe: lo llama la pasarela.
      const res = await fetch(`${base}/api/dev/pay/${orderId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) throw new Error(await res.text());

      window.location.href = `/library/`;
    } catch {
      setError("El simulador de pago solo funciona con NODE_ENV=development");
      setPaying(false);
    }
  };

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-small text-text-secondary">{error}</p>
        <Button asChild className="mt-6">
          <Link href="/explore/">Volver al catalogo</Link>
        </Button>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="text-caption uppercase tracking-wide text-text-tertiary">Pasarela simulada</p>
      <h1 className="mt-2 text-h1 font-medium">{order.title}</h1>

      <dl className="mt-8 space-y-3 rounded-md border border-default p-4">
        <Row label="A pagar" value={formatMinor(order.amountMinor, order.currency)} />
        <Row label="Equivalente" value={`${(order.usdcAmount / 1_000_000).toFixed(2)} USDC`} />
        <Row label="Estado" value={order.status} />
      </dl>

      <p className="mt-4 text-caption text-text-tertiary">
        El tipo de cambio quedo congelado al abrir esta orden. No se recalcula al liquidar.
      </p>

      {order.status === "paid" ? (
        <Button asChild className="mt-8 w-full">
          <Link href="/library/">Ya esta pagada — ver biblioteca</Link>
        </Button>
      ) : (
        <Button className="mt-8 w-full" onClick={() => void pay()} loading={paying}>
          Simular pago aprobado
        </Button>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-small">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium text-text-primary">{value}</dd>
    </div>
  );
}
