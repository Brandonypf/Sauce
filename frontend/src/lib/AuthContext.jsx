import { createContext, useCallback, useContext, useState } from "react";
import { useToast } from "@/components/use-toast";

const STORAGE_KEY = "sauce.user";

const ADMIN_EMAIL = "admin@sauce.app";
const ADMIN_PASSWORD = "admin123";

const AuthContext = createContext(null);

function makeUser({ name, email, role }) {
  return { name: name || email.split("@")[0], email, role: role || "user" };
}

export function AuthProvider({ children }) {
  const { toast } = useToast();
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const persist = (nextUser) => {
    setUser(nextUser);
    if (nextUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const delay = () => new Promise((resolve) => setTimeout(resolve, 500));

  const login = useCallback(
    async (email, password) => {
      setLoading(true);
      await delay();
      setLoading(false);
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        persist(makeUser({ name: "Admin", email: ADMIN_EMAIL, role: "admin" }));
        toast({ title: "Bienvenido, Admin" });
        return { ok: true };
      }
      if (!email || !password) {
        return { ok: false, error: "Completa todos los campos." };
      }
      persist(makeUser({ email }));
      toast({ title: "Sesión iniciada" });
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  const register = useCallback(
    async ({ name, email, password }) => {
      setLoading(true);
      await delay();
      setLoading(false);
      if (!name || !email || !password) {
        return { ok: false, error: "Completa todos los campos." };
      }
      persist(makeUser({ name, email }));
      toast({ title: "Cuenta creada" });
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  const googleSignIn = useCallback(async () => {
    setLoading(true);
    await delay();
    setLoading(false);
    persist(makeUser({ name: "Usuario Google", email: "user@gmail.com" }));
    toast({ title: "Sesión iniciada con Google" });
    return { ok: true };
  }, [toast]);

  const forgotPassword = useCallback(
    async (email) => {
      await delay();
      if (!email) return { ok: false, error: "Escribe tu correo." };
      toast({
        title: "Correo enviado",
        description: "Si la cuenta existe, recibirás un enlace de recuperación.",
      });
      return { ok: true };
    },
    [toast],
  );

  const resetPassword = useCallback(
    async (token, password) => {
      await delay();
      if (!token || !password) {
        return { ok: false, error: "Token o contraseña inválidos." };
      }
      toast({ title: "Contraseña actualizada" });
      return { ok: true };
    },
    [toast],
  );

  const logout = useCallback(() => {
    persist(null);
    toast({ title: "Sesión cerrada" });
  }, [toast]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        googleSignIn,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return context;
}
