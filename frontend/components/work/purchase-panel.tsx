"use client";

import * as React from "react";
import { Play, Heart } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/components/shared/toast-provider";
import { formatPrice } from "@/lib/utils";
import { useLibraryStore } from "@/lib/store";
import type { ContentWork } from "@/types";

interface PurchasePanelProps {
  work: ContentWork;
}

export function PurchasePanel({ work }: PurchasePanelProps) {
  const { isConnected } = useWallet();
  const { openConnectModal } = useConnectModal();
  const { toast } = useToast();
  const owned = useLibraryStore((s) => s.ownedSlugs.includes(work.slug));
  const addOwned = useLibraryStore((s) => s.addOwned);
  const [purchasing, setPurchasing] = React.useState(false);
  const [wishlisted, setWishlisted] = React.useState(false);

  const handlePurchase = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    setPurchasing(true);
    // Mock: aquí se llamará a RoyaltyManager.purchaseLicense(workId)
    await new Promise((r) => setTimeout(r, 1600));
    setPurchasing(false);
    addOwned(work.slug);
    toast("success", `¡${work.title} ya es tuya!`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <p className="text-h2 font-medium text-text-primary">
          {work.price === "0.00" ? "Free" : formatPrice(work.price)}
        </p>
        {owned && <Badge variant="licensed">Licensed</Badge>}
      </div>

      {owned ? (
        <Button variant="success" size="lg" className="w-full">
          <Play className="h-5 w-5" />
          Jugar
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handlePurchase}
          loading={purchasing}
        >
          {!purchasing && <Play className="h-5 w-5" />}
          {purchasing
            ? "Estamos preparando tu copia..."
            : `Comprar — ${work.price === "0.00" ? "Gratis" : formatPrice(work.price)}`}
        </Button>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setWishlisted((v) => !v);
          if (!wishlisted) toast("success", "Añadido a tu lista de deseos");
        }}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? "fill-accent-primary text-accent-primary" : ""}`} />
        {wishlisted ? "En tu lista de deseos" : "Añadir a lista de deseos"}
      </Button>

      <p className="text-caption text-text-tertiary">
        Compra segura · Pago directo al creador · La licencia queda asociada a tu cuenta
      </p>
    </div>
  );
}
