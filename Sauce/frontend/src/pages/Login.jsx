import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { AuthLayout } from "@/components/AuthLayout";
import { GoogleIcon } from "@/components/GoogleIcon";
import { useAuth } from "@/lib/AuthContext";
import { readReturnTo } from "@/lib/authReturnTo";

export function Login() {
  const { login, googleSignIn, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const goBack = (res) => {
    if (res.ok) navigate(readReturnTo(location.search), { replace: true });
    else setError(res.error ?? "No se pudo iniciar sesión.");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    goBack(await login(email, password));
  };

  const handleGoogle = async () => {
    setError("");
    goBack(await googleSignIn());
  };

  return (
    <AuthLayout
      title="Ingresar"
      subtitle="Accede a tu cuenta Sauce."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="font-medium text-primary underline">
            Regístrate
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          <GoogleIcon className="mr-2 size-4" />
          Continuar con Google
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">o</span>
          <div className="h-px flex-1 bg-border" />
        </div>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground underline"
              >
                ¿La olvidaste?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Cargando…" : "Ingresar"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
