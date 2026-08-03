"use client";

import { Work } from "@/data/works";

export function WorkCard({ work }: { work: Work }) {
  return (
    <button className="glass group overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-1">
      <div className="h-24" style={{ background: work.coverColor }} />
      <div className="px-3 py-3">
        {/* lang={undefined} a propósito: el título se muestra en su idioma
            original, sin traducir ni transliterar */}
        <p className="text-sm font-medium text-white">{work.title}</p>
        <p className="mt-0.5 text-xs text-white/50">{work.author}</p>
        <p className="mt-2 text-xs text-accent-violet">
          {work.priceEth === "free" ? "gratis" : `${work.priceEth} ETH`}
        </p>
      </div>
    </button>
  );
}
