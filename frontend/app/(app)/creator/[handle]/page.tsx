import { notFound } from "next/navigation";
import { getCreatorByHandle, creators } from "@/lib/mock-data";
import { CreatorProfile } from "./creator-profile";

export function generateStaticParams() {
  return creators.map((creator) => ({ handle: creator.handle }));
}

export default function CreatorProfilePage({ params }: { params: { handle: string } }) {
  const creator = getCreatorByHandle(params.handle);
  if (!creator) notFound();
  return <CreatorProfile creator={creator} />;
}
