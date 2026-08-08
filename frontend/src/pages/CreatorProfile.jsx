import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/content/Badge";
import { ContentCard } from "@/components/content/ContentCard";
import { api } from "@/api/client";

/**
 * Perfil de creador.
 *
 * Antes tenía un objeto `CREATORS` en duro con dos estudios inventados. Ahora
 * viene de `GET /api/creators/:handle`, que devuelve el perfil y sus obras
 * publicadas en la misma respuesta.
 */
export function CreatorProfile() {
  const { handle } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["creator", handle],
    queryFn: () => api.creators.get(handle),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Creador no encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No existe ningún perfil con el usuario @{handle}.
        </p>
        <Link to="/explore" className="mt-6 inline-block text-sm text-coral">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  const { creator, works = [] } = data;

  return (
    <div>
      <header className="hero-gradient border-b">
        <div className="mx-auto flex max-w-6xl items-end gap-5 px-4 py-14">
          <div
            className="size-20 shrink-0 rounded-2xl border-4 border-white bg-sakura-deep shadow-sm"
            style={
              creator.profile_uri
                ? {
                    backgroundImage: `url(${creator.profile_uri})`,
                    backgroundSize: "cover",
                  }
                : undefined
            }
          />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {creator.name}
              {creator.verified && <BadgeCheck className="size-5 text-coral" />}
            </h1>
            <p className="text-sm text-muted-foreground">@{creator.handle}</p>
            {creator.bio && (
              <p className="mt-2 max-w-xl text-pretty text-sm text-muted-foreground">
                {creator.bio}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">Obras</h2>
          <Badge tone="sakura">{works.length}</Badge>
        </div>

        {works.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-6 py-16 text-center text-sm text-muted-foreground">
            Este creador todavía no ha publicado ninguna obra.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {works.map((work) => (
              <ContentCard key={work.slug} item={work} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
