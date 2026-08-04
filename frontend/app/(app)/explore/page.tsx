"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { works, categoryLabels } from "@/lib/mock-data";
import { ContentGrid } from "@/components/content/content-grid";
import { SearchInput } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContentCategory } from "@/types";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "popular" | "price-asc" | "price-desc";
type CategoryFilter = "all" | ContentCategory;

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Más recientes" },
  { key: "popular", label: "Popular" },
  { key: "price-asc", label: "Precio: menor a mayor" },
  { key: "price-desc", label: "Precio: mayor a menor" },
];

const categories: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "visual-novel", label: "Visual Novels" },
  { key: "manga", label: "Mangas" },
  { key: "game", label: "Juegos" },
  { key: "music", label: "Música" },
  { key: "illustration", label: "Ilustraciones" },
];

export default function ExplorePage() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = works;
    if (category !== "all") result = result.filter((w) => w.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          w.creator.name.toLowerCase().includes(q) ||
          w.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    switch (sort) {
      case "newest":
        result = [...result].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "popular":
        result = [...result].sort((a, b) => b.licenseCount - a.licenseCount);
        break;
      case "price-asc":
        result = [...result].sort((a, b) => Number(a.price) - Number(b.price));
        break;
      case "price-desc":
        result = [...result].sort((a, b) => Number(b.price) - Number(a.price));
        break;
    }
    return result;
  }, [category, query, sort]);

  const activeSort = sortOptions.find((o) => o.key === sort)!;
  const activeCategory = categories.find((c) => c.key === category)!;

  return (
    <div className="pb-16">
      <header className="mb-8">
        <h1 className="text-h1 font-medium">Explorar</h1>
        <p className="mt-1 text-small text-text-secondary">
          {category === "all" ? "Todas las obras" : categoryLabels[category]} · {filtered.length}{" "}
          {filtered.length === 1 ? "obra" : "obras"}
        </p>
      </header>

      <div className="sticky top-16 z-[5] -mx-6 -mt-4 bg-bg-base/90 px-6 py-4 backdrop-blur md:-mx-12 md:px-12 lg:-mx-16 lg:px-16">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={category}
            onValueChange={(v) => setCategory(v as CategoryFilter)}
            className="order-2 overflow-x-auto lg:order-1"
          >
            <TabsList>
              {categories.map((c) => (
                <TabsTrigger key={c.key} value={c.key}>
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="order-1 flex items-center gap-3 lg:order-2">
            <div className="w-full lg:w-64">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar obras, creadores, tags..."
                aria-label="Buscar obras"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end lg:mt-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-default bg-bg-surface px-4 text-small text-text-primary transition-colors hover:bg-bg-elevated"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              Ordenar por: {activeSort.label}
              <ChevronDown
                className={cn("h-4 w-4 text-text-tertiary transition-transform", sortOpen && "rotate-180")}
              />
            </button>
            {sortOpen && (
              <ul
                role="listbox"
                className="absolute right-0 z-[20] mt-1 w-56 overflow-hidden rounded-md border border-default bg-bg-surface py-1 shadow-lg animate-scale-in"
              >
                {sortOptions.map((opt) => (
                  <li key={opt.key} role="option" aria-selected={opt.key === sort}>
                    <button
                      type="button"
                      onClick={() => {
                        setSort(opt.key);
                        setSortOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center px-4 py-2 text-left text-small transition-colors hover:bg-bg-elevated",
                        opt.key === sort ? "text-accent-primary" : "text-text-primary",
                      )}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated text-2xl">
            🍶
          </div>
          <h2 className="mt-4 text-h3 font-medium">Aún no hay obras aquí</h2>
          <p className="mt-1 max-w-xs text-small text-text-secondary">
            {query
              ? `No encontramos resultados para "${query}". Prueba con otros términos.`
              : "¿Por qué no exploras otra categoría?"}
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <ContentGrid works={filtered} />
        </div>
      )}

      <p className="mt-4 text-center text-caption text-text-tertiary" aria-hidden="true">
        {activeCategory.label}
      </p>
    </div>
  );
}
