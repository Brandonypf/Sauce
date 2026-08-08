import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { AuthLayout } from "@/components/AuthLayout";
import { GoogleIcon } from "@/components/GoogleIcon";
import { useAuth } from "@/lib/AuthContext";

export function Register() {
  const { register, googleSignIn, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const res = await register(form);
    if (res.ok) navigate("/", { replace: true });
    else setError(res.error ?? "No se pudo crear la cuenta.");
  };

  const handleGoogle = async () => {
    setError("");
    const res = await googleSignIn();
    if (res.ok) navigate("/", { replace: true });
  };

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Únete a Sauce y empieza a vender tu contenido."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-medium text-primary underline">
            Ingresar
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
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Tu nombre"
              value={form.name}
              onChange={setField("name")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={form.email}
              onChange={setField("email")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={setField("password")}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Creando cuenta…" : "Registrarse"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
