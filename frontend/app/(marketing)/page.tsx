import Link from "next/link";
import Image from "next/image";
import { Compass, ShoppingBag, PlayCircle, ChevronDown } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { ContentCarousel } from "@/components/content/content-carousel";
import { ContentCard } from "@/components/content/content-card";
import { CreatorCard } from "@/components/creator/creator-card";
import { works, creators, getWorkBySlug } from "@/lib/mock-data";

const steps = [
  {
    icon: Compass,
    title: "Descubre",
    text: "Explora un catálogo curado de Visual Novels, mangas y juegos indie.",
  },
  {
    icon: ShoppingBag,
    title: "Compra",
    text: "Paga directo al creador. Sin intermediarios, sin comisiones abusivas.",
  },
  {
    icon: PlayCircle,
    title: "Juega",
    text: "Tu biblioteca, tus obras, en cualquier dispositivo. Para siempre.",
  },
];

export default function LandingPage() {
  const featured = getWorkBySlug("hoshizora-no-kanata") ?? works[0];
  const newest = [...works].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const popular = [...works].sort((a, b) => b.licenseCount - a.licenseCount).slice(0, 4);

  return (
    <>
      <Navbar />

      {/* HERO */}
      <section className="relative flex min-h-[80vh] items-center overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={featured.coverUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-base via-bg-base/80 to-bg-base/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-transparent to-bg-base/40" />
        </div>

        <div className="relative mx-auto w-full max-w-shell px-6 py-24 md:px-12 lg:px-16">
          <div className="max-w-2xl">
            <p className="text-caption font-medium uppercase tracking-widest text-accent-primary">
              Visual Novels · Mangas · Juegos indie
            </p>
            <h1 className="mt-4 text-hero font-medium leading-tight text-text-primary">
              Historias que no encontrarás en ningún otro lado
            </h1>
            <p className="mt-4 max-w-lg text-h3 font-normal text-text-secondary">
              Creadores hispanohablantes publican sus obras sin intermediarios. Tú las descubres,
              compras y juegas con la confianza de siempre.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/explore">Explorar obras</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/explore">Conoce a los creadores</Link>
              </Button>
            </div>
          </div>
        </div>

        <a
          href="#novedades"
          aria-label="Bajar"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-down text-text-tertiary transition-colors hover:text-text-primary"
        >
          <ChevronDown className="h-6 w-6" />
        </a>
      </section>

      {/* NOVEDADES */}
      <section id="novedades" className="mx-auto max-w-shell px-6 py-16 md:px-12 lg:px-16">
        <ContentCarousel works={newest.slice(0, 8)} title="Llegó hoy" viewAllHref="/explore" />
      </section>

      {/* POPULARES */}
      <section className="bg-bg-elevated/60">
        <div className="mx-auto max-w-shell px-6 py-16 md:px-12 lg:px-16">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-h2 font-medium">Populares esta semana</h2>
            <Link
              href="/explore"
              className="text-small text-text-secondary transition-colors hover:text-accent-primary"
            >
              Ver todo →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {popular.map((work, i) => (
              <div key={work.id} className="relative">
                {i === 0 && (
                  <span className="absolute -top-3 left-4 z-[1] rounded-full bg-accent-primary px-3 py-1 text-caption font-medium uppercase tracking-wider text-white shadow-md">
                    Top
                  </span>
                )}
                <ContentCard work={work} priority={i === 0} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CREADORES */}
      <section className="mx-auto max-w-shell px-6 py-16 md:px-12 lg:px-16">
        <h2 className="mb-6 text-h2 font-medium">Creadores destacados</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {creators.map((creator) => (
            <CreatorCard key={creator.handle} creator={creator} />
          ))}
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="mx-auto max-w-shell px-6 pb-16 md:px-12 lg:px-16">
        <div className="rounded-lg bg-bg-surface border border-default p-8 md:p-12">
          <h2 className="text-center text-h2 font-medium">Cómo funciona</h2>
          <p className="mx-auto mt-2 max-w-md text-center text-small text-text-secondary">
            Tres pasos. Sin letra pequeña.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                  <step.icon className="h-6 w-6 text-accent-primary" />
                </div>
                <p className="mt-4 text-h3 font-medium">
                  <span className="text-text-tertiary">{i + 1}. </span>
                  {step.title}
                </p>
                <p className="mt-2 max-w-[260px] text-small text-text-secondary">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
