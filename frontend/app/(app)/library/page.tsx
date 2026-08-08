"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Play, ShieldCheck, Link2, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useLibraryStore } from "@/lib/store";
import { useToast } from "@/components/shared/toast-provider";
import { api, ApiError, type LibraryItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Biblioteca.
 *
 * Esta pagina cambio de raiz. Antes cruzaba `works` del mock con `ownedSlugs` de
 * localStorage: cualquiera podia editarlo y aparecerse el catalogo completo. Ahora
 * los datos vienen de `/api/library`, que lee la tabla `entitlements` — la unica
 * fuente de verdad sobre quien tiene que.
 *
 * Conectar la wallet ya no basta: hace falta sesion, porque el backend necesita
 * una prueba de que quien pide controla esa direccion.
 */
export default function LibraryPage() {
  const { isConnected, authenticated, checking, signIn, signingIn } = useSession();
  const { toast } = useToast();
  const setOwned = useLibraryStore((s) => s.setOwned);

  const [items, setItems] = React.useState<LibraryItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!authenticated) return;

    let cancelled = false;

    api.library
      .list()
      .then(({ items: fetched }) => {
        if (cancelled) return;
        setItems(fetched);
        setOwned(fetched.map((i) => i.slug));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "No se pudo cargar");
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, setOwned]);

  const openWork = async (slug: string) => {
    try {
      const { url } = await api.works.access(slug);
      window.location.href = url;
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "No se pudo abrir");
    }
  };

  if (checking) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!isConnected || !authenticated) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated">
          <ShieldCheck className="h-7 w-7 text-text-tertiary" />
        </div>
        <h1 className="mt-4 text-h1 font-medium">Tu biblioteca</h1>
        <p className="mt-2 max-w-sm text-small text-text-secondary">
          {isConnected
            ? "Firma un mensaje para demostrar que esta wallet es tuya. No cuesta gas."
            : "Conecta tu wallet para ver las obras que has comprado."}
        </p>

        {isConnected ? (
          <Button className="mt-6" onClick={() => void signIn()} loading={signingIn}>
            Iniciar sesion
          </Button>
        ) : (
          <Button asChild className="mt-6">
            <Link href="/explore">Explorar obras</Link>
          </Button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-24 text-center">
        <p className="text-small text-text-secondary">{error}</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <header className="mb-8">
        <h1 className="text-h1 font-medium">Mi biblioteca</h1>
        <p className="mt-1 text-small text-text-secondary">
          {items.length} {items.length === 1 ? "obra" : "obras"}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated text-2xl">
            📚
          </div>
          <p className="mt-4 text-small text-text-secondary">Todavia no tienes ninguna obra.</p>
          <Button asChild className="mt-6">
            <Link href="/explore">Explorar el catalogo</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.slug} className="rounded-md border border-default overflow-hidden">
              {item.coverUrl && (
                <Image
                  src={item.coverUrl}
                  alt={item.title}
                  width={600}
                  height={800}
                  className="aspect-[3/4] w-full object-cover"
                />
              )}

              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <p className="text-caption text-text-tertiary">{item.creatorName}</p>
                  </div>
                  <Badge variant="licensed">Con licencia</Badge>
                </div>

                <Button className="w-full" onClick={() => void openWork(item.slug)}>
                  <Play className="h-4 w-4" />
                  Abrir
                </Button>

                {/*
                  El recibo on-chain es opcional y no bloquea el acceso: el usuario
                  ya pago y su licencia ya vale. Reclamarlo le da una prueba que
                  sobrevive a esta plataforma.
                */}
                {item.orderId && !item.onchainClaimed && (
                  <Link
                    href={`/verify/?order=${item.orderId}`}
                    className="flex items-center gap-1.5 text-caption text-text-tertiary hover:text-text-secondary"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Reclamar recibo on-chain
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
