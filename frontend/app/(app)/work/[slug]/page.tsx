import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar } from "lucide-react";
import { getWorkBySlug, getWorksByCreator, categoryLabels, works } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ContentCarousel } from "@/components/content/content-carousel";
import { PurchasePanel } from "@/components/work/purchase-panel";

export function generateStaticParams() {
  return works.map((work) => ({ slug: work.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const work = getWorkBySlug(params.slug);
  return {
    title: work ? `${work.title} — SAUCE` : "SAUCE",
    description: work?.description,
  };
}

export default function WorkPage({ params }: { params: { slug: string } }) {
  const work = getWorkBySlug(params.slug);
  if (!work) notFound();

  const moreWorks = getWorksByCreator(work.creator.handle).filter((w) => w.id !== work.id);

  const details: { label: string; value: string }[] = [
    { label: "Idioma", value: work.language },
    ...(work.duration ? [{ label: "Duración", value: work.duration }] : []),
    ...(work.engine ? [{ label: "Engine", value: work.engine }] : []),
  ];

  return (
    <div className="pb-16">
      {/* HERO */}
      <section className="grid gap-10 lg:grid-cols-[40%_60%] lg:items-start">
        <div className="relative mx-auto w-full max-w-[380px]">
          <div className="overflow-hidden rounded-md border border-default shadow-lg">
            <Image
              src={work.coverUrl}
              alt={work.title}
              width={600}
              height={800}
              priority
              className="aspect-[3/4] w-full object-cover"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="category">{categoryLabels[work.category]}</Badge>
            {work.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>

          <h1 className="mt-4 text-h1 font-medium leading-tight">{work.title}</h1>

          <div className="mt-4 flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{work.creator.handle.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <Link
                href={`/creator/${work.creator.handle}`}
                className="text-small font-medium text-text-primary transition-colors hover:text-accent-primary"
              >
                {work.creator.name}
              </Link>
              <p className="flex items-center gap-1.5 text-caption text-text-tertiary">
                <Calendar className="h-3 w-3" />
                {new Date(work.createdAt).toLocaleDateString("es-PE", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <p className="mt-6 text-body text-text-secondary">{work.description}</p>

          <div className="mt-8 max-w-md">
            <PurchasePanel work={work} />
          </div>
        </div>
      </section>

      {/* GALERÍA */}
      {work.screenshots.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 text-h2 font-medium">Galería</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {work.screenshots.map((src, i) => (
              <figure
                key={i}
                className="w-[420px] shrink-0 snap-start overflow-hidden rounded-md border border-default"
              >
                <Image
                  src={src}
                  alt={`Captura ${i + 1} de ${work.title}`}
                  width={1280}
                  height={720}
                  className="aspect-video w-full object-cover"
                />
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* SINOPSIS */}
      <section className="mt-16 max-w-3xl">
        <h2 className="mb-4 text-h2 font-medium">Sinopsis</h2>
        <p className="whitespace-pre-line text-body leading-relaxed text-text-secondary">
          {work.synopsis}
        </p>
      </section>

      {/* DETALLES */}
      <section className="mt-16 max-w-3xl">
        <h2 className="mb-4 text-h2 font-medium">Detalles</h2>
        <dl className="grid gap-4 rounded-md border border-default bg-bg-surface p-6 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-caption uppercase tracking-wider text-text-tertiary">
                {d.label}
              </dt>
              <dd className="mt-1 text-small text-text-primary">{d.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-caption uppercase tracking-wider text-text-tertiary">Licencias vendidas</dt>
            <dd className="mt-1 text-small text-text-primary">{work.licenseCount.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      {/* SOBRE EL CREADOR */}
      <section className="mt-16">
        <div className="flex flex-col gap-6 rounded-md border border-default bg-bg-surface p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-h3">{work.creator.handle.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="text-h3 font-medium">{work.creator.name}</h2>
            <p className="mt-1 text-small text-text-secondary">{work.creator.bio}</p>
            <p className="mt-1 text-caption text-text-tertiary">
              {work.creator.workCount} obras · {work.creator.followerCount.toLocaleString()} seguidores
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href={`/creator/${work.creator.handle}`}>Ver perfil</Link>
          </Button>
        </div>
      </section>

      {/* MÁS DE ESTE CREADOR */}
      {moreWorks.length > 0 && (
        <section className="mt-16">
          <ContentCarousel works={moreWorks} title={`Más de ${work.creator.name}`} />
        </section>
      )}
    </div>
  );
}
