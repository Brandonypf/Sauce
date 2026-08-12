import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { AuthLayout } from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

export function ForgotPassword() {
  const { forgotPassword, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const res = await forgotPassword(email);
    if (res.ok) setSent(true);
    else setError(res.error ?? "No se pudo enviar el correo.");
  };

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace para restablecerla."
      footer={
        <>
          <Link to="/login" className="font-medium text-primary underline">
            Volver a ingresar
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-10 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            Si existe una cuenta para{" "}
            <span className="font-medium">{email}</span>, recibirás un correo
            con las instrucciones.
          </p>
          <Button className="w-full" onClick={() => setSent(false)}>
            Reenviar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Enviando…" : "Enviar enlace"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
