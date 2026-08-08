import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";
import { ContentCard } from "@/components/content/ContentCard";
import { CheckoutModal } from "@/components/checkout/CheckoutModal";
import { WORK_FORMATS } from "@/lib/app-params";
import { api } from "@/api/client";

/**
 * Catálogo.
 *
 * Antes esto tenía un `MOCK_ITEMS` con seis productos inventados —guías de
 * Arbitrum, packs de assets— que además no eran contenido otaku. Se eliminó
 * entero: los datos vienen de `GET /api/works`, que lee la tabla `works` de
 * Postgres.
 *
 * El filtro por texto también se movió al servidor. Filtrar en el cliente exige
 * traerse el catálogo completo en cada carga, lo que deja de funcionar en cuanto
 * hay más de unas decenas de obras; y el backend ya tiene un índice GIN sobre
 * `search_vector` que hace esto mucho mejor que un `.filter()`.
 */
export function Explore() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [checkoutItem, setCheckoutItem] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["works", { format, q: query }],
    queryFn: () => api.works.list({ format, q: query || undefined }),
    // El usuario sigue escribiendo: se mantiene la lista anterior visible en vez
    // de parpadear a un spinner en cada tecla.
    placeholderData: (previous) => previous,
  });

  const works = data?.works ?? [];
  const selectedLabel =
    WORK_FORMATS.find((f) => f.value === format)?.label ?? "Todos";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold">Explorar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Juegos, manga y novelas visuales con licencia de sus creadores.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o creador…"
            className="pl-9"
          />
        </div>

        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="sm:w-56">
            <SelectValue>{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {WORK_FORMATS.map((f) => (
              <SelectItem key={f.value || "all"} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <p className="py-24 text-center text-sm text-muted-foreground">
          No se pudo cargar el catálogo: {error?.message}
        </p>
      )}

      {!isLoading && !isError && works.length === 0 && (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Todavía no hay obras publicadas que coincidan.
        </p>
      )}

      {works.length > 0 && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <ContentCard
              key={work.slug}
              item={work}
              onBuy={() => setCheckoutItem(work)}
            />
          ))}
        </div>
      )}

      {checkoutItem && (
        <CheckoutModal
          item={checkoutItem}
          open
          onOpenChange={(open) => !open && setCheckoutItem(null)}
        />
      )}
    </div>
  );
}
