"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { ContentWork } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabels } from "@/lib/mock-data";
import { formatPrice } from "@/lib/utils";

interface ContentCardProps {
  work: ContentWork;
  owned?: boolean;
  priority?: boolean;
}

export function ContentCard({ work, owned = false, priority = false }: ContentCardProps) {
  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group overflow-hidden rounded-md border border-default bg-bg-surface shadow-sm transition-shadow hover:border-hover hover:shadow-lg"
    >
      <Link href={`/work/${work.slug}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden">
          <Image
            src={work.coverUrl}
            alt={work.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iODAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmMmVlIi8+PC9zdmc+"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />

          {owned && (
            <Badge variant="licensed" className="absolute right-2 top-2 shadow-sm">
              Licensed
            </Badge>
          )}
          {work.createdAt && isNew(work.createdAt) && !owned && (
            <Badge variant="new" className="absolute left-2 top-2">
              Nuevo
            </Badge>
          )}
        </div>

        <div className="space-y-1 p-4">
          <Badge variant="category">{categoryLabels[work.category]}</Badge>
          <h3 className="truncate text-small font-medium text-text-primary">{work.title}</h3>
          <Link
            href={`/creator/${work.creator.handle}`}
            className="block truncate text-caption text-text-secondary transition-colors hover:text-accent-primary"
          >
            {work.creator.name}
          </Link>
          <p className="text-small font-medium text-text-primary">
            {work.price === "0.00" ? "Free" : formatPrice(work.price)}
          </p>
        </div>
      </Link>

      {owned && (
        <div className="px-4 pb-4">
          <Button asChild variant="success" size="sm" className="w-full">
            <Link href={`/work/${work.slug}`}>
              <Play className="h-4 w-4" />
              Jugar
            </Link>
          </Button>
        </div>
      )}
    </motion.article>
  );
}

function isNew(dateStr: string) {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  return days <= 7;
}

export function ContentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-default bg-bg-surface">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
