import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { AuthLayout } from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

export function ResetPassword() {
  const { resetPassword, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const res = await resetPassword(token, password);
    if (res.ok) navigate("/login", { replace: true });
    else setError(res.error ?? "El enlace es inválido o expiró.");
  };

  return (
    <AuthLayout
      title="Nueva contraseña"
      subtitle="Elige una contraseña segura."
      footer={
        <>
          <Link to="/login" className="font-medium text-primary underline">
            Volver a ingresar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Guardando…" : "Actualizar contraseña"}
        </Button>
      </form>
    </AuthLayout>
  );
}
