"use client";

import Link from "next/link";
import Image from "next/image";
import { Play, ShieldCheck } from "lucide-react";
import { works } from "@/lib/mock-data";
import { useLibraryStore } from "@/lib/store";
import { useWallet } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export default function LibraryPage() {
  const { isConnected } = useWallet();
  const ownedSlugs = useLibraryStore((s) => s.ownedSlugs);
  const ownedWorks = works.filter((w) => ownedSlugs.includes(w.slug));

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated">
          <ShieldCheck className="h-7 w-7 text-text-tertiary" />
        </div>
        <h1 className="mt-4 text-h1 font-medium">Tu biblioteca</h1>
        <p className="mt-2 max-w-sm text-small text-text-secondary">
          Conecta tu wallet para ver las obras que has comprado. Todo queda asociado a tu cuenta,
          de forma segura.
        </p>
        <Button asChild className="mt-6">
          <Link href="/explore">Explorar obras</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <header className="mb-8">
        <h1 className="text-h1 font-medium">Mi biblioteca</h1>
        <p className="mt-1 text-small text-text-secondary">
          {ownedWorks.length} {ownedWorks.length === 1 ? "obra" : "obras"} · Última jugada:{" "}
          {ownedWorks[0]?.title ?? "aún no juegas nada"}
        </p>
      </header>

      {ownedWorks.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated text-2xl">
            📚
          </div>
          <h2 className="mt-4 text-h3 font-medium">Tu biblioteca está vacía</h2>
          <p className="mt-1 max-w-xs text-small text-text-secondary">
            Compra tu primera obra y aparecerá aquí para siempre.
          </p>
          <Button asChild className="mt-6">
            <Link href="/explore">Explorar obras</Link>
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="recent">Recientes</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {ownedWorks.map((work) => (
                <article
                  key={work.id}
                  className="overflow-hidden rounded-md border border-default bg-bg-surface shadow-sm transition-shadow hover:shadow-lg"
                >
                  <Link href={`/work/${work.slug}`} className="block">
                    <div className="relative aspect-[3/4] overflow-hidden">
                      <Image
                        src={work.coverUrl}
                        alt={work.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover"
                      />
                      <Badge variant="licensed" className="absolute right-2 top-2 shadow-sm">
                        Licensed
                      </Badge>
                    </div>
                    <div className="space-y-2 p-4">
                      <h3 className="truncate text-small font-medium">{work.title}</h3>
                      <Progress value={35} aria-label="Progreso" />
                      <p className="text-caption text-text-tertiary">Capítulo 3 de 8</p>
                    </div>
                  </Link>
                  <div className="px-4 pb-4">
                    <Button asChild variant="success" size="sm" className="w-full">
                      <Link href={`/work/${work.slug}`}>
                        <Play className="h-4 w-4" />
                        Jugar
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="recent">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {ownedWorks.slice(0, 4).map((work) => (
                <article
                  key={work.id}
                  className="overflow-hidden rounded-md border border-default bg-bg-surface shadow-sm transition-shadow hover:shadow-lg"
                >
                  <Link href={`/work/${work.slug}`} className="block">
                    <div className="relative aspect-[3/4] overflow-hidden">
                      <Image
                        src={work.coverUrl}
                        alt={work.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover"
                      />
                      <Badge variant="licensed" className="absolute right-2 top-2 shadow-sm">
                        Licensed
                      </Badge>
                    </div>
                    <div className="space-y-2 p-4">
                      <h3 className="truncate text-small font-medium">{work.title}</h3>
                      <Progress value={35} aria-label="Progreso" />
                      <p className="text-caption text-text-tertiary">Capítulo 3 de 8</p>
                    </div>
                  </Link>
                  <div className="px-4 pb-4">
                    <Button asChild variant="success" size="sm" className="w-full">
                      <Link href={`/work/${work.slug}`}>
                        <Play className="h-4 w-4" />
                        Jugar
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
