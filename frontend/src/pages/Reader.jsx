import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/button";
import { api, ApiError } from "@/api/client";

/**
 * Lector integrado.
 *
 * Es lo que convierte "descargar un archivo" en "leer dentro de la app". Sin
 * esto, `/api/works/:slug/access` devuelve una URL firmada y el navegador
 * simplemente descarga el PDF — que era justo lo que no querías.
 *
 * La URL se pide en cada apertura y caduca en minutos. No se guarda en el estado
 * ni en localStorage: una URL firmada almacenada es un permiso que sobrevive a la
 * revocación de la licencia.
 */
export function Reader() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.works.get(slug), api.works.access(slug)])
      .then(([{ work }, { url }]) => {
        if (cancelled) return;
        setState({ status: "ready", work, url });
      })
      .catch((e) => {
        if (cancelled) return;

        setState({
          status: "error",
          message:
            e instanceof ApiError && e.status === 403
              ? "No tienes licencia de esta obra."
              : (e?.message ?? "No se pudo abrir la obra"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") {
    return (
      <div className="grid h-dvh place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="grid h-dvh place-items-center bg-background px-6 text-center">
        <div>
          <AlertCircle className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-4 font-medium">{state.message}</p>
          <Button className="mt-6" onClick={() => navigate("/library")}>
            Volver a mi biblioteca
          </Button>
        </div>
      </div>
    );
  }

  const { work, url } = state;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Cerrar el lector"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-sakura-glow hover:text-coral"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{work.title}</p>
          <p className="truncate text-xs text-muted-foreground">{work.creatorName}</p>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Viewer url={url} format={work.format} title={work.title} />
      </main>
    </div>
  );
}

/**
 * Elige el visor según el formato.
 *
 * Para PDF se usa el visor nativo del navegador en un iframe. Es una decisión
 * consciente: pdf.js pesa cerca de un megabyte y aquí no aporta nada que el
 * usuario note. Cuando quieras controles propios —modo sakura, guardar la página,
 * lectura continua— es el momento de cambiarlo por `react-pdf`, y solo cambia
 * este componente.
 *
 * El iframe va con `sandbox` porque el archivo lo sube un tercero: sin él, un PDF
 * o un HTML malicioso puede ejecutar scripts con el origen de tu aplicación y
 * leer la sesión del usuario.
 */
function Viewer({ url, format, title }) {
  if (format === "manga") {
    return <MangaViewer url={url} title={title} />;
  }

  return (
    <iframe
      src={url}
      title={title}
      className="size-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
}

/**
 * Visor de manga.
 *
 * Placeholder honesto: el visor secuencial necesita la lista de páginas, y para
 * eso hace falta el endpoint `/api/works/:slug/chapters`, que todavía no existe.
 * Mientras tanto abre el archivo tal cual en vez de fingir una interfaz que no
 * puede paginar nada.
 */
function MangaViewer({ url, title }) {
  return (
    <iframe
      src={url}
      title={title}
      className="size-full border-0 bg-neutral-900"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
