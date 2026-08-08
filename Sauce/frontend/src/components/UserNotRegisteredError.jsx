import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent } from "@/components/card";

export function UserNotRegisteredError({ email, onBack }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <AlertTriangle className="size-10 text-amber-500" />
        <div>
          <p className="font-semibold">Cuenta no encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No existe una cuenta Sauce asociada a{" "}
            <span className="font-medium">{email}</span>. Regístrate para
            continuar.
          </p>
        </div>
        <Button onClick={onBack}>Volver</Button>
      </CardContent>
    </Card>
  );
}
