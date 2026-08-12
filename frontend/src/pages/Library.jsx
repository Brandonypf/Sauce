import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Loader2, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/button";
import { Badge } from "@/components/content/Badge";
import { ApiError } from "@/api/client";
import { api } from "@/api/client";

/**
 * Biblioteca.
 *
 * Antes tenía un `PURCHASED` en duro con una obra inventada. Los datos vienen de
 * `GET /api/library`, que lee la tabla `entitlements` — la única fuente de verdad
 * sobre quién tiene qué.
 *
 * Importante: la propiedad NO se comprueba con `balanceOf` on-chain, aunque el
 * prompt lo pedía. Un saldo de token no puede proteger un archivo: cualquiera
 * puede leerlo, pero solo el servidor decide si entrega los bytes. Además el
 * comprador tiene acceso desde que paga, sin necesidad de canjear el recibo
 * on-chain, y una comprobación por `balanceOf` le negaría lo que ya pagó.
 */
export function Library() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["library"],
    queryFn: () => api.library.list(),
    retry: false,
  });

  // Abre el lector, no descarga. `api.works.access` devuelve una URL firmada que
  // el navegador trataría como descarga; el lector la pide él mismo y la muestra
  // dentro de la aplicación.
  const openWork = (slug) => navigate(`/reader/${slug}`);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 401 no es un error: es que no hay sesión todavía.
  if (error instanceof ApiError && error.status === 401) {
    return (
      <EmptyState
        title="Inicia sesión para ver tu biblioteca"
        body="Conecta tu wallet y firma un mensaje. No cuesta gas."
        cta={{ to: "/explore", label: "Explorar el catálogo" }}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        title="No se pudo cargar tu biblioteca"
        body={error.message}
        cta={{ to: "/", label: "Volver al inicio" }}
      />
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        title="Tu biblioteca está vacía"
        body="Las obras que adquieras aparecerán aquí, listas para leer o jugar."
        cta={{ to: "/explore", label: "Explorar obras" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Mi biblioteca</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length} {items.length === 1 ? "obra" : "obras"}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <article key={item.slug} className="work-card flex flex-col">
            <div className="relative">
              <div className="aspect-cover w-full bg-sakura-glow">
                {item.coverUrl && (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </div>
              <span className="absolute left-2.5 top-2.5">
                <Badge tone="licensed">
                  <ShieldCheck className="size-3" />
                  Licensed
                </Badge>
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3.5">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                {item.title}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {item.creatorName}
              </p>

              <Button
                className="mt-auto w-full bg-success text-white hover:bg-success/90"
                size="sm"
                onClick={() => openWork(item.slug)}
              >
                <Play className="size-4 fill-current" />
                JUGAR
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, body, cta }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-sakura-glow">
        <BookOpen className="size-6 text-coral" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-6">
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </div>
  );
}
