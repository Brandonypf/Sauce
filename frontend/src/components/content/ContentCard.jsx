import { Link } from "react-router-dom";
import { Play, ShieldCheck } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "@/components/button";
import { formatMinor } from "@/api/client";
import { WORK_FORMATS } from "@/lib/app-params";

/**
 * Tarjeta de obra.
 *
 * Cambios respecto a la versión de Base44, que era una tarjeta de producto
 * genérica:
 *
 * - Portada 3:4 en vez de 16:9. Es la proporción de una portada de manga o de la
 *   caja de un juego; en 16:9 el arte se recorta por arriba y por abajo, que es
 *   justo donde suele estar el personaje.
 * - Precio en soles desde `priceMinor`, no en USDC. El comprador paga en su
 *   moneda; el USDC es cosa de la liquidación al creador y no le interesa.
 * - El enlace lleva a la obra, no al creador. Antes toda la portada apuntaba al
 *   perfil, así que no había forma de llegar a la ficha desde el catálogo.
 */
export function ContentCard({ item, onBuy, owned = false, top = false }) {
  const {
    slug,
    title,
    creatorName,
    creatorHandle,
    priceMinor,
    priceCurrency = "PEN",
    coverUrl,
    format,
  } = item ?? {};

  const formatLabel =
    WORK_FORMATS.find((f) => f.value === format)?.label ?? "Obra";

  return (
    <article className="work-card group flex h-full flex-col">
      <Link to={`/work/${slug}`} className="relative block overflow-hidden">
        <div className="aspect-cover w-full bg-sakura-glow">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid size-full place-items-center px-4 text-center text-xs text-muted-foreground">
              Sin portada
            </div>
          )}
        </div>

        {/* Esquina superior: propiedad a la izquierda, destacado a la derecha.
            Nunca compiten por el mismo sitio. */}
        {owned && (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone="licensed">
              <ShieldCheck className="size-3" />
              Licensed
            </Badge>
          </span>
        )}

        {top && (
          <span className="absolute right-2.5 top-2.5">
            <Badge tone="top">TOP</Badge>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <Badge tone="sakura" className="self-start">
          {formatLabel}
        </Badge>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
          <Link to={`/work/${slug}`} className="hover:text-coral">
            {title}
          </Link>
        </h3>

        <Link
          to={`/creator/${creatorHandle}`}
          className="truncate text-xs text-muted-foreground hover:text-coral"
        >
          {creatorName ?? `@${creatorHandle}`}
        </Link>

        <div className="mt-auto pt-2">
          {owned ? (
            <Button
              className="w-full bg-success text-white hover:bg-success/90"
              size="sm"
              onClick={() => onBuy?.(item)}
            >
              <Play className="size-4 fill-current" />
              JUGAR
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {priceMinor === 0
                  ? "Gratis"
                  : formatMinor(priceMinor ?? 0, priceCurrency)}
              </span>
              {/* Gratis y de pago se distinguen desde la propia tarjeta: pedir
                  "Comprar" por algo que no cuesta nada hace dudar al usuario. */}
              <Button size="sm" onClick={() => onBuy?.(item)}>
                {priceMinor === 0 ? "Obtener" : "Comprar"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
