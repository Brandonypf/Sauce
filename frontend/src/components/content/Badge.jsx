import { cn } from "@/utils";

/**
 * Etiquetas del catálogo.
 *
 * `licensed` se queda en verde a propósito, contra la paleta sakura: es la única
 * señal de que el usuario ya posee la obra, y tiene que distinguirse de un vistazo
 * en una rejilla llena de coral y rosa. Si fuera del mismo tono, dejaría de
 * significar algo.
 */
const TONES = {
  default: "bg-muted text-muted-foreground",
  sakura: "bg-sakura-glow text-coral",
  top: "bg-coral text-white",
  licensed: "bg-success-soft text-success",
  outline: "border bg-card text-muted-foreground",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ tone = "default", className = "", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none tracking-wide",
        TONES[tone] ?? TONES.default,
        className,
      )}
      {...props}
    />
  );
}
