import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/button";
import { ContentCard } from "@/components/content/ContentCard";
import { CheckoutModal } from "@/components/checkout/CheckoutModal";
import { Link } from "react-router-dom";

const PURCHASED = [
  { id: 1, title: "Guía completa de Arbitrum", creator: "Sauce Studio", handle: "sauce", price: 5, category: "Guías" },
];

export function Library() {
  const [checkoutItem, setCheckoutItem] = useState(null);

  if (PURCHASED.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <BookOpen className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Tu biblioteca está vacía</h1>
        <p className="mt-2 text-muted-foreground">
          Compra tu primer contenido para verlo aquí.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/explore">Explorar contenido</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold">Mi biblioteca</h1>
      <p className="mt-1 text-muted-foreground">
        Contenido que ya desbloqueaste.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PURCHASED.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            onBuy={setCheckoutItem}
          />
        ))}
      </div>

      <CheckoutModal
        open={!!checkoutItem}
        onOpenChange={(open) => {
          if (!open) setCheckoutItem(null);
        }}
        item={checkoutItem}
      />
    </div>
  );
}
