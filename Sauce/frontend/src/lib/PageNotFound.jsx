import { Link } from "react-router-dom";
import { Button } from "@/components/button";

export function PageNotFound() {
  return (
    <div className="grid min-h-screen place-items-center p-4 text-center">
      <div>
        <p className="text-6xl font-black text-muted-foreground">404</p>
        <h1 className="mt-4 text-2xl font-bold">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La ruta que buscas no existe o fue movida.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
