"use client";

import Link from "next/link";
import { useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { getWorksByCreator } from "@/lib/mock-data";
import type { Creator } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ContentGrid } from "@/components/content/content-grid";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function CreatorProfile({ creator }: { creator: Creator }) {
  const [following, setFollowing] = useState(false);

  const creatorWorks = getWorksByCreator(creator.handle);

  return (
    <div className="pb-16">
      {/* BANNER */}
      <div className="-mx-6 -mt-8 h-40 bg-gradient-to-r from-accent-soft to-bg-elevated md:-mx-12 lg:-mx-16" />

      <div className="relative -mt-12 flex flex-col gap-6 sm:flex-row sm:items-end">
        <Avatar className="h-24 w-24 rounded-full border-4 border-bg-base shadow-md">
          <AvatarFallback className="text-h1">{creator.handle.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-h1 font-medium">{creator.name}</h1>
          <p className="text-small text-text-secondary">@{creator.handle}</p>
        </div>
        <Button
          variant={following ? "secondary" : "primary"}
          onClick={() => setFollowing((v) => !v)}
        >
          {following ? (
            <>
              <UserCheck className="h-4 w-4" /> Siguiendo
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" /> Seguir
            </>
          )}
        </Button>
      </div>

      <p className="mt-6 max-w-2xl text-body text-text-secondary">{creator.bio}</p>
      <p className="mt-2 text-caption text-text-tertiary">
        {creator.workCount} obras · {creator.followerCount.toLocaleString()} seguidores
      </p>

      <Tabs defaultValue="works" className="mt-10">
        <TabsList>
          <TabsTrigger value="works">Obras</TabsTrigger>
          <TabsTrigger value="about">Sobre</TabsTrigger>
        </TabsList>

        <TabsContent value="works">
          <ContentGrid works={creatorWorks} />
        </TabsContent>

        <TabsContent value="about">
          <div className="max-w-2xl rounded-md border border-default bg-bg-surface p-6">
            <h2 className="text-h3 font-medium">Sobre {creator.name}</h2>
            <p className="mt-3 whitespace-pre-line text-small leading-relaxed text-text-secondary">
              {creator.bio}

              {creator.handle === "nekomori" &&
                "\n\nNekomori nació en 2021 como un proyecto de dos personas y una computadora. Desde entonces hemos publicado ocho obras y aprendido a contar historias que hagan ruido en silencio."}
            </p>
            <div className="mt-6 flex flex-wrap gap-6 border-t border-default pt-4 text-small">
              <div>
                <p className="font-medium text-text-primary">{creator.workCount}</p>
                <p className="text-caption text-text-tertiary">Obras publicadas</p>
              </div>
              <div>
                <p className="font-medium text-text-primary">
                  {creator.followerCount.toLocaleString()}
                </p>
                <p className="text-caption text-text-tertiary">Seguidores</p>
              </div>
              <div>
                <p className="font-medium text-text-primary">
                  {creatorWorks.reduce((acc, w) => acc + w.licenseCount, 0).toLocaleString()}
                </p>
                <p className="text-caption text-text-tertiary">Licencias vendidas</p>
              </div>
            </div>
            <Button asChild variant="secondary" className="mt-6">
              <Link href="/explore">Ver todas las obras</Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
