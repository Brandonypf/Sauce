import { Link } from "react-router-dom";
import { CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/button";

/**
 * Vista posterior a la compra.
 *
 * Antes solo decia "puedes verlo en tu Biblioteca" y ofrecia "Continuar", que
 * cerraba el modal y dejaba al usuario donde estaba. Para llegar al contenido
 * habia que navegar a mano: Biblioteca, buscar la obra, abrirla.
 *
 * Ahora la accion principal lleva directo al lector. La Biblioteca sigue estando
 * como accion secundaria: no se elimina nada, solo deja de ser el unico camino.
 *
 * El control de acceso no cambia. El lector pide `POST /api/works/:slug/access`
 * y el backend comprueba el entitlement igual que antes; este boton solo evita
 * una navegacion manual.
 */
export function SuccessView({ item, onDone }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-success-soft">
        <CheckCircle2 className="size-7 text-success" />
      </div>

      <div>
        <h3 className="text-xl font-bold">¡Listo!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ya tienes acceso a <span className="font-medium">{item?.title}</span>.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="w-full bg-success text-white hover:bg-success/90">
          <Link to={`/reader/${item?.slug}`} onClick={onDone}>
            <Play className="size-4 fill-current" />
            Abrir contenido
          </Link>
        </Button>

        <Button asChild variant="outline" className="w-full">
          <Link to="/library" onClick={onDone}>
            Ir a mi biblioteca
          </Link>
        </Button>

        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Seguir explorando
        </button>
      </div>
    </div>
  );
}
