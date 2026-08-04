"use client";

import { useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { SearchBar } from "@/components/SearchBar";
import { WorkCard } from "@/components/WorkCard";
import { works } from "@/data/works";
import { searchWorks } from "@/lib/search";

export default function LandingPage() {
  const [query, setQuery] = useState("");
  const results = searchWorks(query, works);

  return (
    <main className="mx-auto min-h-screen max-w-3xl overflow-hidden rounded-2xl">
      <TitleBar active="catálogo" />

      <section className="px-7 pb-6 pt-10 text-center">
        <p className="text-2xl font-medium text-white">descubre y colecciona</p>
        <p className="bg-gradient-to-r from-accent-violet to-accent-pink bg-clip-text text-2xl font-medium text-transparent">
          novelas visuales independientes
        </p>
        <p className="mt-3 text-sm text-white/50">
          licencias verificables en Arbitrum, sin comisiones abusivas
        </p>
      </section>

      <section className="px-7 pb-10">
        <SearchBar onSearch={setQuery} />

        <p className="mb-3 mt-6 text-sm text-white/50">
          {query ? `resultados para "${query}"` : "destacados esta semana"}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {results.map((work) => (
            <WorkCard key={work.id} work={work} />
          ))}
        </div>

        {results.length === 0 && (
          <p className="py-8 text-center text-sm text-white/40">
            no encontramos ninguna obra con ese término.
          </p>
        )}
      </section>
    </main>
  );
}
