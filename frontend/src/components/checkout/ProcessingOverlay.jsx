import { Loader2 } from "lucide-react";

export function ProcessingOverlay() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <div>
        <p className="font-semibold">Procesando tu pago…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No cierres esta ventana.
        </p>
      </div>
    </div>
  );
}
