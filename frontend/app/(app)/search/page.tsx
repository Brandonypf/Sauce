"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { works, creators } from "@/lib/mock-data";
import { SearchInput } from "@/components/ui/input";
import { ContentGrid } from "@/components/content/content-grid";
import { CreatorCard } from "@/components/creator/creator-card";

function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return { works: [], creators: [] };
    return {
      works: works.filter(
        (w) =>
          w.title.toLowerCase().includes(query) ||
          w.description.toLowerCase().includes(query) ||
          w.tags.some((t) => t.toLowerCase().includes(query)),
      ),
      creators: creators.filter(
        (c) => c.name.toLowerCase().includes(query) || c.handle.toLowerCase().includes(query),
      ),
    };
  }, [q]);

  const submit = () => {
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <div className="pb-16">
      <header className="mb-8">
        <h1 className="text-h1 font-medium">Buscar</h1>
        <p className="mt-1 text-small text-text-secondary">
          Encuentra obras, creadores y tags en todo SAUCE.
        </p>
      </header>

      <div className="max-w-xl">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Buscar Visual Novels, creadores, tags..."
          autoFocus
        />
      </div>

      {!q.trim() ? (
        <p className="mt-16 text-center text-small text-text-tertiary">
          Escribe algo para empezar a buscar.
        </p>
      ) : (
        <>
          {results.creators.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-4 text-h2 font-medium">Creadores</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {results.creators.map((c) => (
                  <CreatorCard key={c.handle} creator={c} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="mb-4 text-h2 font-medium">Obras</h2>
            {results.works.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <p className="text-h3 font-medium">Sin resultados para “{q}”</p>
                <p className="mt-1 text-small text-text-secondary">
                  Prueba con otro término o explora el catálogo completo.
                </p>
              </div>
            ) : (
              <ContentGrid works={results.works} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="pb-16">
          <div className="skeleton h-10 w-40" />
          <div className="mt-8 skeleton h-12 w-full max-w-xl" />
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
