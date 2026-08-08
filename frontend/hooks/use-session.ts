"use client";

import * as React from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, ApiError } from "@/lib/api";
import { useLibraryStore } from "@/lib/store";

/**
 * Sesion del backend.
 *
 * Conectar la wallet no es iniciar sesion. wagmi solo dice que hay una direccion
 * disponible en el navegador; el backend necesita una prueba de que quien pide
 * controla esa direccion. De ahi el nonce firmado.
 */
export function useSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const reset = useLibraryStore((s) => s.reset);

  const [authenticated, setAuthenticated] = React.useState(false);
  const [sessionAddress, setSessionAddress] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [signingIn, setSigningIn] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const me = await api.auth.me();
      setAuthenticated(me.authenticated);
      setSessionAddress(me.address ?? null);
    } catch {
      setAuthenticated(false);
      setSessionAddress(null);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Si el usuario cambia de cuenta en la wallet, la sesion del backend sigue
  // siendo de la anterior. Cerrarla evita que compre con una cuenta y la licencia
  // acabe en otra.
  React.useEffect(() => {
    if (!authenticated || !sessionAddress || !address) return;
    if (address.toLowerCase() === sessionAddress.toLowerCase()) return;

    void api.auth.logout().then(() => {
      setAuthenticated(false);
      setSessionAddress(null);
      reset();
    });
  }, [address, sessionAddress, authenticated, reset]);

  const signIn = React.useCallback(async () => {
    if (!address) throw new Error("Conecta tu wallet primero");

    setSigningIn(true);

    try {
      const { nonce, domain } = await api.auth.nonce();

      const message = [
        `${domain} quiere que inicies sesion con tu wallet.`,
        "",
        `Direccion: ${address}`,
        `Nonce: ${nonce}`,
        "",
        "Firmar no cuesta gas y no autoriza ninguna transaccion.",
      ].join("\n");

      const signature = await signMessageAsync({ message });

      await api.auth.verify(address, nonce, signature);
      await refresh();
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessageAsync, refresh]);

  const signOut = React.useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    setAuthenticated(false);
    setSessionAddress(null);
    reset();
  }, [reset]);

  return {
    isConnected,
    address,
    authenticated,
    checking,
    signingIn,
    signIn,
    signOut,
    refresh,
  };
}

export { ApiError };
