import { useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/content/Badge";
import { ContentCard } from "@/components/content/ContentCard";
import { CheckoutModal } from "@/components/checkout/CheckoutModal";

const CREATORS = {
  sauce: {
    name: "Sauce Studio",
    handle: "sauce",
    verified: true,
    bio: "Estudio enfocado en educación web3 y recursos para builders.",
    items: [
      { id: 1, title: "Guía completa de Arbitrum", creator: "Sauce Studio", handle: "sauce", price: 5, category: "Guías" },
      { id: 2, title: "Curso de Foundry desde cero", creator: "Sauce Studio", handle: "sauce", price: 25, category: "Cursos" },
      { id: 3, title: "Ebook: tokenomics 101", creator: "Sauce Studio", handle: "sauce", price: 15, category: "Cursos" },
    ],
  },
  pixel: {
    name: "Pixel Poeta",
    handle: "pixel",
    verified: false,
    bio: "Ilustrador digital. Assets y plantillas para proyectos web3.",
    items: [
      { id: 1, title: "Pack de assets neon", creator: "Pixel Poeta", handle: "pixel", price: 12, category: "Assets" },
    ],
  },
};

export function CreatorProfile() {
  const { handle } = useParams();
  const [checkoutItem, setCheckoutItem] = useState(null);
  const creator = CREATORS[handle] ?? {
    name: handle,
    handle,
    verified: false,
    bio: "Este creador aún no tiene biografía.",
    items: [],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="grid size-20 place-items-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
          {creator.name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{creator.name}</h1>
            <Badge tone={creator.verified ? "success" : "outline"}>
              {creator.verified ? "Verificado" : "No verificado"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">@{creator.handle}</p>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-muted-foreground">{creator.bio}</p>

      <h2 className="mt-12 text-xl font-semibold">Obras</h2>
      {creator.items.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creator.items.map((item) => (
            <ContentCard key={item.id} item={item} onBuy={setCheckoutItem} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-muted-foreground">Sin obras publicadas.</p>
      )}

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
