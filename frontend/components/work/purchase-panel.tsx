"use client";

import * as React from "react";
import { Heart, Play, Wallet } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/components/shared/toast-provider";
import { api, ApiError, formatMinor, type ApiWork } from "@/lib/api";
import { useLibraryStore } from "@/lib/store";
import { useCheckoutStore } from "@/lib/checkout-store";
import { CheckoutModal } from "@/components/checkout/checkout-modal";

interface PurchasePanelProps {
  work: ApiWork;
}

/**
 * Panel de compra.
 *
 * Antes simulaba la compra con un setTimeout de 1.6s y escribia la propiedad en
 * localStorage. Ahora abre una orden real y manda al usuario a la pasarela.
 *
 * La diferencia importante de interfaz: el usuario SE VA de la aplicacion. No hay
 * spinner que acabe en exito; hay una redireccion, y la licencia aparece cuando el
 * webhook llega al backend — que puede ser antes o despues de que el usuario
 * vuelva. Por eso aqui no se marca nada como comprado.
 */
export function PurchasePanel({ work }: PurchasePanelProps) {
  const { isConnected, authenticated, signIn, signingIn } = useSession();
  const { openConnectModal } = useConnectModal();
  const { toast } = useToast();

  const markOwned = useLibraryStore((s) => s.markOwned);
  const cachedOwned = useLibraryStore((s) => s.ownedSlugs.includes(work.slug));
  const owned = work.owned ?? cachedOwned;

  const openCheckout = useCheckoutStore((s) => s.openFor);
  const [opening, setOpening] = React.useState(false);

  // Se genera una vez por montaje y se reutiliza en cada reintento. Generarla en
  // cada clic haria que un doble clic creara dos ordenes.
  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  // Abrir el modal en vez de redirigir de una. El usuario elige metodo primero:
  // Yape se resuelve dentro de la app, PayPal y wallet salen al navegador.
  const handlePurchase = () => {
    openCheckout(work.slug);
  };

  /**
   * El backend revisa la licencia y devuelve una URL firmada que caduca en
   * minutos. Ningun saldo de token puede reemplazar esta llamada.
   */
  const handleOpen = async () => {
    setOpening(true);

    try {
      const { url } = await api.works.access(work.slug);
      window.location.href = url;
    } catch (error) {
      toast("error", error instanceof ApiError ? error.message : "No se pudo abrir el contenido");
    } finally {
      setOpening(false);
    }
  };

  const price = work.priceMinor === 0 ? "Gratis" : formatMinor(work.priceMinor, work.priceCurrency);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <p className="text-h2 font-medium text-text-primary">{price}</p>
        {owned && <Badge variant="licensed">Con licencia</Badge>}
      </div>

      {owned ? (
        <Button variant="success" size="lg" className="w-full" onClick={handleOpen} loading={opening}>
          {!opening && <Play className="h-5 w-5" />}
          Abrir
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handlePurchase}
          loading={signingIn}
        >
          {!signingIn && (isConnected ? <Play className="h-5 w-5" /> : <Wallet className="h-5 w-5" />)}
          {signingIn ? "Firma en tu wallet..." : isConnected ? `Comprar — ${price}` : "Conecta tu wallet"}
        </Button>
      )}

      <WishlistButton title={work.title} />

      <p className="text-caption text-text-tertiary">
        Pago en moneda local · El creador cobra en USDC · La licencia queda asociada a tu cuenta
      </p>

      <CheckoutModal work={work} />
    </div>
  );
}

function WishlistButton({ title }: { title: string }) {
  const { toast } = useToast();
  const [wishlisted, setWishlisted] = React.useState(false);

  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={() => {
        setWishlisted((v) => !v);
        if (!wishlisted) toast("success", `${title} anadido a tu lista de deseos`);
      }}
    >
      <Heart className={`h-4 w-4 ${wishlisted ? "fill-accent-primary text-accent-primary" : ""}`} />
      {wishlisted ? "En tu lista de deseos" : "Anadir a lista de deseos"}
    </Button>
  );
}
