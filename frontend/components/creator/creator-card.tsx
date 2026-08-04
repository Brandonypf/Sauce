import Link from "next/link";
import type { Creator } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function CreatorCard({ creator }: { creator: Creator }) {
  return (
    <Link
      href={`/creator/${creator.handle}`}
      className="group flex flex-col items-center gap-3 rounded-md border border-default bg-bg-surface p-6 text-center transition-all hover:border-hover hover:shadow-lg"
    >
      <Avatar className="h-16 w-16 ring-2 ring-bg-elevated transition-transform group-hover:scale-105">
        <AvatarImage src={creator.avatarUrl} alt={creator.name} />
        <AvatarFallback>{creator.handle.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-small font-medium text-text-primary">{creator.name}</p>
        <p className="text-caption text-text-secondary">@{creator.handle}</p>
      </div>
      <p className="text-caption text-text-tertiary">
        {creator.workCount} obras · {formatFollowers(creator.followerCount)}
      </p>
    </Link>
  );
}

function formatFollowers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k seguidores`;
  return `${n} seguidores`;
}
