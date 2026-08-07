"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ContentWork } from "@/types";
import { ContentCard } from "./content-card";

interface ContentCarouselProps {
  works: ContentWork[];
  title: string;
  viewAllHref?: string;
  ownedSlugs?: Set<string>;
}

export function ContentCarousel({ works, title, viewAllHref, ownedSlugs }: ContentCarouselProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-medium">{title}</h2>
        <div className="flex items-center gap-2">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-small text-text-secondary transition-colors hover:text-accent-primary"
            >
              Ver todo →
            </Link>
          )}
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => scrollBy(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-default text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => scrollBy(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-default text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={trackRef}
        className="-mx-1 flex gap-6 overflow-x-auto px-1 pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {works.map((work) => (
          <div key={work.id} className="w-[220px] shrink-0 snap-start sm:w-[240px]">
            <ContentCard work={work} owned={ownedSlugs?.has(work.slug)} />
          </div>
        ))}
      </div>
    </section>
  );
}
