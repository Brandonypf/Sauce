import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/button";

export function SuccessView({ item, onDone }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <CheckCircle2 className="size-12 text-emerald-500" />
      <div>
        <h3 className="text-xl font-bold">¡Listo!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ya tienes acceso a <span className="font-medium">{item?.title}</span>.
          Puedes verlo en tu Biblioteca.
        </p>
      </div>
      <Button onClick={onDone}>Continuar</Button>
    </div>
  );
}
