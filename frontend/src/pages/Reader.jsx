import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/button";
import { api, ApiError } from "@/api/client";

const API_ORIGIN = "http://localhost:4000";

/**
 * Convierte una URL relativa devuelta por el backend
 * en una URL absoluta apuntando al backend.
 */
function resolveBackendUrl(url) {
  if (!url) return url;

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

export function Reader() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.works.get(slug),
      api.works.access(slug),
    ])
      .then(([{ work }, { url }]) => {
        if (cancelled) return;

        setState({
          status: "ready",
          work,
          url: resolveBackendUrl(url),
        });
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-coral" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="size-10 text-coral" />

        <p className="mt-4 text-sm text-muted-foreground">
          {state.message}
        </p>

        <Button
          className="mt-6"
          onClick={() => navigate("/library")}
        >
          Volver a mi biblioteca
        </Button>
      </div>
    );
  }

  const { work, url } = state;

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-background/95 px-4 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          aria-label="Cerrar el lector"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-sakura-glow hover:text-coral"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {work.title}
          </p>

          <p className="truncate text-xs text-muted-foreground">
            {work.creatorName}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Viewer
          url={url}
          format={work.format}
          title={work.title}
        />
      </main>
    </div>
  );
}

function Viewer({ url, format, title }) {
  if (format === "manga") {
    return (
      <MangaViewer
        url={url}
        title={title}
      />
    );
  }

  return (
    <iframe
      src={url}
      title={title}
      className="size-full border-0 bg-neutral-900"
    />
  );
}

function MangaViewer({ url, title }) {
  return (
    <iframe
      src={url}
      title={title}
      className="size-full border-0 bg-neutral-900"
    />
  );
}
