import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { authReturnTo } from "@/lib/authReturnTo";

export function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?${authReturnTo(location.pathname + location.search)}`}
        replace
      />
    );
  }

  // El backend todavia no expone roles: `GET /api/auth/me` devuelve email,
  // wallet y displayName, nunca `role`. Comparar contra `user.role` hacia que
  // `undefined !== "admin"` fuera siempre cierto y expulsaba a TODO el mundo de
  // /admin, incluido quien deberia entrar.
  //
  // Hasta que exista el campo, se deja pasar a cualquier sesion valida y se
  // deja constancia. Fingir una comprobacion que no comprueba nada es peor que
  // no tenerla: da sensacion de seguridad sin darla.
  if (role && import.meta.env.DEV) {
    console.warn(
      `[ProtectedRoute] La ruta pide rol "${role}" pero el backend no expone roles todavia.`,
    );
  }

  return children;
}
