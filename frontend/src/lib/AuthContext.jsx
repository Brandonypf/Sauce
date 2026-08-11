import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/api/client";

/**
 * Sesión del usuario.
 *
 * La fuente de verdad es la cookie httpOnly que emite el backend; el estado de
 * aquí es solo un reflejo de `GET /api/auth/me`. Nada de `localStorage`: el
 * navegador no puede leer ni fabricar esa cookie, que es justo el punto.
 *
 * CONTRATO DE ERRORES
 *
 * Todos los métodos devuelven `{ ok: true }` o `{ ok: false, error }` y **no
 * lanzan**. Es el patrón que ya usaban las cinco páginas de autenticación
 * (`Register`, `Login`, `ForgotPassword`, `ResetPassword`), así que se adopta ese
 * en vez de introducir un segundo sistema. Una versión anterior dejaba escapar
 * `ApiError`, lo que rompía `if (res.ok)` con un TypeError antes de poder mostrar
 * el mensaje.
 */

const AuthContext = createContext(null);

/** Traduce cualquier fallo al contrato `{ ok: false, error }`. */
function fail(error) {
  if (error instanceof ApiError) {
    // `displayMessage` expande los detalles de zod: "Al menos 12 caracteres"
    // en vez del genérico "Datos invalidos".
    return { ok: false, error: error.displayMessage, code: error.code };
  }

  return { ok: false, error: error?.message ?? "Error inesperado" };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  // Separado de `status`: `loading` es la comprobación inicial de sesión y
  // `pending` es el envío de un formulario. Mezclarlos hacía que el botón nunca
  // mostrara "Creando cuenta…", porque la comprobación inicial ya había acabado.
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();

      if (me.authenticated) {
        setUser({
          email: me.email,
          wallet: me.wallet,
          displayName: me.displayName,
          canClaimOnchain: me.canClaimOnchain,
        });
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      // Backend caído: se trata como "sin sesión". Quedarse en "loading" para
      // siempre congelaría la interfaz sin explicar por qué.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Registro.
   *
   * Acepta tanto `register({ name, email, password })` —que es como lo llama
   * `Register.jsx`— como `register(email, password, displayName)`. La primera
   * forma es la que se usa; la segunda se mantiene por si algún componente la
   * espera todavía.
   *
   * `name` se traduce a `displayName`, que es como se llama el campo en el
   * esquema real del backend.
   */
  const register = useCallback(
    async (emailOrForm, maybePassword, maybeDisplayName) => {
      const input =
        typeof emailOrForm === "object" && emailOrForm !== null
          ? {
              email: emailOrForm.email,
              password: emailOrForm.password,
              displayName: emailOrForm.displayName ?? emailOrForm.name,
            }
          : { email: emailOrForm, password: maybePassword, displayName: maybeDisplayName };

      // El backend rechaza `displayName: ""` porque exige mínimo 1 carácter.
      // Un campo vacío significa "no lo puso", no "cadena vacía".
      if (!input.displayName) delete input.displayName;

      setPending(true);

      try {
        await api.auth.register(input);
        await refresh();
        return { ok: true };
      } catch (error) {
        return fail(error);
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  const login = useCallback(
    async (emailOrForm, maybePassword) => {
      const input =
        typeof emailOrForm === "object" && emailOrForm !== null
          ? { email: emailOrForm.email, password: emailOrForm.password }
          : { email: emailOrForm, password: maybePassword };

      setPending(true);

      try {
        await api.auth.login(input);
        await refresh();
        return { ok: true };
      } catch (error) {
        return fail(error);
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Aunque falle la llamada, la sesión local se limpia: dejar la interfaz
      // como autenticada cuando el usuario pidió salir es peor que un error.
    }

    setUser(null);
    setStatus("unauthenticated");

    return { ok: true };
  }, []);

  /**
   * Pendientes de implementar en el backend.
   *
   * Devuelven `{ ok: false }` en vez de lanzar, para que las páginas que ya las
   * llaman muestren el mensaje en lugar de romperse con un TypeError.
   */
  const notImplemented = useCallback(
    (nombre) => async () => ({
      ok: false,
      error: `${nombre} todavía no está disponible.`,
      code: "not_implemented",
    }),
    [],
  );

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      isLoading: status === "loading",
      // `loading` lo leen las páginas para deshabilitar el botón: debe reflejar
      // el envío en curso, no la comprobación inicial.
      loading: pending || status === "loading",
      pending,
      register,
      login,
      logout,
      refresh,
      forgotPassword: notImplemented("Recuperar contraseña"),
      resetPassword: notImplemented("Restablecer contraseña"),
      googleSignIn: notImplemented("El acceso con Google"),
    }),
    [user, status, pending, register, login, logout, refresh, notImplemented],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

export { ApiError };
