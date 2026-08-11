import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/button";
import { ContentCard } from "@/components/content/ContentCard";
import { CheckoutModal } from "@/components/checkout/CheckoutModal";
import { api } from "@/api/client";

/**
 * Portada.
 *
 * El hero usa gradiente sakura en vez de una imagen de fondo. Es deliberado: no
 * tenemos derechos sobre ninguna ilustración de anime, y una plataforma cuyo
 * argumento de venta es el contenido licenciado no puede abrir con arte tomado de
 * cualquier sitio. Cuando haya obras publicadas, el hero puede mostrar la portada
 * de una obra destacada — arte propio, subido por su creador.
 */
export function Landing() {
  // Mismo estado que Explore: Home no tenia ninguno, asi que `onBuy` llegaba
  // undefined a la tarjeta y `onBuy?.(item)` se tragaba el clic sin error.
  const [checkoutItem, setCheckoutItem] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["works", "landing"],
    queryFn: () => api.works.list({ limit: 8 }),
  });

  const works = data?.works ?? [];

  return (
    <div>
      <Hero />

      <section className="mx-auto max-w-6xl px-4 py-16">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Llegó hoy</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lo más reciente del catálogo
            </p>
          </div>

          <Link
            to="/explore"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-coral hover:text-coral-hover"
          >
            Ver todo
            <ArrowRight className="size-4" />
          </Link>
        </header>

        {isLoading ? (
          <SkeletonRow />
        ) : works.length === 0 ? (
          <EmptyCatalogue />
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {works.map((work, i) => (
              <ContentCard
                key={work.slug}
                item={work}
                top={i === 0}
                onBuy={() => setCheckoutItem(work)}
              />
            ))}
          </div>
        )}
      </section>

      {checkoutItem && (
        <CheckoutModal
          open
          item={checkoutItem}
          onOpenChange={(next) => !next && setCheckoutItem(null)}
          onComplete={() => refetch()}
        />
      )}
    </div>
  );
}

function Hero() {
  return (
    <section className="hero-gradient relative overflow-hidden border-b">
      <Petals />

      <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sakura-glow px-3 py-1 text-xs font-medium text-coral">
          <Sparkles className="size-3.5" />
          Creadores hispanohablantes
        </span>

        <h1 className="mt-5 animate-fade-up text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Historias que no encontrarás
          <br />
          en ningún otro lado
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Visual Novels, mangas y juegos indie de creadores hispanohablantes.
          Con licencia, pagados en tu moneda.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/explore">Explorar obras</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            {/*
              Antes apuntaba a /creators, que no existe: llevaba a PageNotFound.
              No se inventa una seccion de creadores —a los perfiles ya se llega
              desde cada obra— y se evita duplicar el CTA de al lado mandando
              este al estudio, que es el otro lado del mercado y una ruta real.
            */}
            <Link to="/studio">Publica tu obra</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Pétalos de fondo. Puramente decorativos, ocultos a lectores de pantalla. */
function Petals() {
  const petals = [
    { left: "8%", delay: "0s", duration: "14s", size: 10 },
    { left: "22%", delay: "3s", duration: "18s", size: 7 },
    { left: "41%", delay: "6s", duration: "16s", size: 12 },
    { left: "63%", delay: "1.5s", duration: "20s", size: 8 },
    { left: "78%", delay: "8s", duration: "15s", size: 11 },
    { left: "91%", delay: "4.5s", duration: "19s", size: 6 },
  ];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {petals.map((p) => (
        <span
          key={p.left}
          className="petal absolute top-0 rounded-[50%_0_50%_0] bg-sakura-pink/60"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="work-card">
          <div className="aspect-cover w-full animate-pulse bg-sakura-glow" />
          <div className="space-y-2 p-3.5">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Estado vacío.
 *
 * El catálogo está vacío hasta que subas obras, y una rejilla vacía se lee como
 * una página rota. Esto convierte el vacío en una invitación a publicar, que es
 * lo que de verdad hace falta ahora mismo.
 */
function EmptyCatalogue() {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-sakura-glow">
        <Sparkles className="size-5 text-coral" />
      </div>
      <p className="mt-4 font-medium">Todavía no hay obras publicadas</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        El catálogo se llena desde el estudio de creador. Publica la primera y
        aparecerá aquí.
      </p>
      <Button asChild className="mt-6">
        <Link to="/studio">Ir al estudio</Link>
      </Button>
    </div>
  );
}
