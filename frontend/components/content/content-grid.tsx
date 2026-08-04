import type { ContentWork } from "@/types";
import { ContentCard, ContentCardSkeleton } from "./content-card";

interface ContentGridProps {
  works: ContentWork[];
  ownedSlugs?: Set<string>;
  loading?: boolean;
  skeletonCount?: number;
}

export function ContentGrid({
  works,
  ownedSlugs,
  loading = false,
  skeletonCount = 8,
}: ContentGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ContentCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {works.map((work) => (
        <ContentCard key={work.id} work={work} owned={ownedSlugs?.has(work.slug)} />
      ))}
    </div>
  );
}
