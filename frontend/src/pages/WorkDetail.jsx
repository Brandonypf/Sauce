import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/button";
import { Badge } from "@/components/content/Badge";
import { ContentCard } from "@/components/content/ContentCard";
import { CheckoutModal } from "@/components/checkout/CheckoutModal";
import { api, formatMinor } from "@/api/client";
import { WORK_FORMATS } from "@/lib/app-params";

/**
 * Ficha de obra.
 *
 * Este archivo estaba VACIO (0 bytes) y no habia ruta `/work/:slug`. Las tarjetas
 * de Home y de Explore enlazaban ahi desde la portada y el titulo, asi que abrir
 * una obra llevaba a una pagina inexistente desde cualquier sitio.
 *
 * Explore parecia funcionar mejor solo porque su boton "Comprar" abre el modal
 * directamente desde la tarjeta, saltandose la ficha.
 */
export function WorkDetail() {
  const { slug } = useParams();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Las obras de "Mas de este creador" abren su propio checkout. Reutilizan el
  // mismo modal: `checkoutItem` decide cual obra se compra.
  const [otraObra, setOtraObra] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["work", slug],
    queryFn: () => api.works.get(slug),
    retry: false,
  });

  const work = data?.work;

  const { data: delCreador } = useQuery({
    queryKey: ["creator", work?.creatorHandle],
    queryFn: () => api.creators.get(work.creatorHandle),
    enabled: Boolean(work?.creatorHandle),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <AlertCircle className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Obra no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Puede que se haya retirado del catalogo.
        </p>
        <Button asChild className="mt-6">
          <Link to="/explore">Volver al catalogo</Link>
        </Button>
      </div>
    );
  }

  const formatLabel = WORK_FORMATS.find((f) => f.value === work.format)?.label ?? "Obra";
  const otras = (delCreador?.works ?? []).filter((w) => w.slug !== work.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 md:grid-cols-[minmax(0,340px)_1fr]">
        <div className="aspect-cover w-full overflow-hidden rounded-xl border bg-sakura-glow">
          {work.coverUrl ? (
            <img src={work.coverUrl} alt={work.title} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-sm text-muted-foreground">
              Sin portada
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="sakura">{formatLabel}</Badge>
            {work.owned && (
              <Badge tone="licensed">
                <ShieldCheck className="size-3" />
                Licensed
              </Badge>
            )}
          </div>

          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight">{work.title}</h1>

          <Link
            to={`/creator/${work.creatorHandle}`}
            className="mt-1 inline-block text-sm text-muted-foreground hover:text-coral"
          >
            {work.creatorName ?? `@${work.creatorHandle}`}
          </Link>

          {work.description && (
            <p className="mt-6 text-pretty text-sm leading-relaxed text-muted-foreground">
              {work.description}
            </p>
          )}

          <div className="mt-8 max-w-sm space-y-3 rounded-xl border bg-card p-5">
            <p className="text-2xl font-bold">
              {work.priceMinor === 0 ? "Gratis" : formatMinor(work.priceMinor, work.priceCurrency)}
            </p>

            {work.owned ? (
              <Button asChild className="w-full bg-success text-white hover:bg-success/90">
                <Link to={`/reader/${work.slug}`}>
                  <Play className="size-4 fill-current" />
                  JUGAR
                </Link>
              </Button>
            ) : (
              <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
                {work.priceMinor === 0
                  ? "Obtener gratis"
                  : `Comprar — ${formatMinor(work.priceMinor, work.priceCurrency)}`}
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              {work.priceMinor === 0
                ? "Sin coste. Se anade a tu biblioteca al instante."
                : "Pago en moneda local. La licencia queda asociada a tu cuenta."}
            </p>
          </div>
        </div>
      </div>

      {otras.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight">Mas de este creador</h2>
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {otras.slice(0, 4).map((w) => (
              <ContentCard key={w.slug} item={w} onBuy={() => setOtraObra(w)} />
            ))}
          </div>
        </section>
      )}

      {otraObra && (
        <CheckoutModal
          open
          item={otraObra}
          onOpenChange={(next) => !next && setOtraObra(null)}
        />
      )}

      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        item={work}
        // Tras comprar se revalida la ficha: `owned` pasa a true y el boton
        // cambia a JUGAR sin recargar la pagina.
        onComplete={() => refetch()}
      />
    </div>
  );
}
