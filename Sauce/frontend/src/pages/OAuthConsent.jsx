import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/button";
import { AuthLayout } from "@/components/AuthLayout";
import { APP_NAME } from "@/lib/app-params";

export function OAuthConsent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [approved, setApproved] = useState(false);
  const clientName =
    searchParams.get("client_name") ?? "Sauce Studio (demo)";

  const handle = () => {
    setApproved(true);
    setTimeout(() => navigate("/", { replace: true }), 800);
  };

  return (
    <AuthLayout
      title="Autorización requerida"
      subtitle={`${clientName} quiere conectarse a tu cuenta ${APP_NAME}.`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-4">
          <ShieldCheck className="size-8 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Al aprobar, {clientName} podrá leer tu perfil público. No podrá
            realizar transacciones sin tu confirmación.
          </p>
        </div>
        {approved ? (
          <p className="text-center text-sm text-muted-foreground">
            Redirigiendo…{clientName}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => navigate("/", { replace: true })}>
              Rechazar
            </Button>
            <Button onClick={handle}>Aprobar</Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
