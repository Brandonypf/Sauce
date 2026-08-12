import { createContext, useCallback, useContext, useState } from "react";
import { useToast } from "@/components/use-toast";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";

const DEMO_ADDRESS = "0x5c554263A55a59adb30f6eeDB978EEf252dd0d72";
const DEMO_CHAIN_ID = 421614;

const WalletContext = createContext(null);

function buildSiweMessage(address, nonce) {
  return [
    "SAUCE quiere que inicies sesion con tu wallet.",
    "",
    `Direccion: ${address}`,
    `Nonce: ${nonce}`,
    "",
    "Firmar no cuesta gas y no autoriza ninguna transaccion.",
  ].join("\n");
}

export function WalletProvider({ children }) {
  const { toast } = useToast();
  const { user, isAuthenticated, refresh } = useAuth();
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Estado local solo para la sesion de wallet-only, donde todavia no hay
  // usuario en el backend cuando se dibuja.
  const [localAddress, setLocalAddress] = useState(null);

  /**
   * La direccion la manda el BACKEND, no este contexto.
   *
   * Antes vivia en un `useState` y nada la rehidrataba: al recargar volvia a
   * null y la wallet desaparecia de la interfaz aunque el backend la tuviera
   * guardada. Ahora sale de `GET /api/auth/me`, que es estado de servidor y
   * sobrevive a F5 sin tocar localStorage.
   */
  const address = user?.wallet ?? localAddress;

  const connect = useCallback(async () => {
    setIsConnecting(true);

    try {
      if (!window.ethereum) {
        await new Promise((resolve) => setTimeout(resolve, 600));

        setLocalAddress(DEMO_ADDRESS);
        setChainId(DEMO_CHAIN_ID);

        toast({
          title: "Modo demo",
          description:
            "No se detectó una wallet. La publicación requiere una wallet real.",
        });

        return;
      }

      // 1. Conectar wallet
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts?.[0]) {
        throw new Error("No se obtuvo ninguna dirección de wallet.");
      }

      const walletAddress = accounts[0];

      // 2. Obtener red
      const chain = await window.ethereum.request({
        method: "eth_chainId",
      });

      const currentChainId = parseInt(chain, 16);

      // 3. Pedir nonce al backend
      const { nonce } = await api.auth.nonce();

      // 4. Construir exactamente el mensaje esperado por el backend
      const message = buildSiweMessage(walletAddress, nonce);

      // 5. Pedir a la wallet que firme el mensaje
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });

      /**
       * 6. Vincular o iniciar sesion, segun corresponda.
       *
       * Este era el bug real del F5. `verify` es el LOGIN por wallet: llama a
       * `upsertUser(wallet)`, que crea o encuentra un usuario distinto y emite
       * una cookie nueva. Si el usuario ya habia entrado con email, conectar la
       * wallet lo sacaba de su cuenta y lo metia en otra sin email.
       *
       * Por eso al recargar "desaparecian el usuario y la wallet": la sesion ya
       * no era la suya. Con sesion abierta hay que VINCULAR, no volver a entrar.
       */
      if (isAuthenticated) {
        await api.auth.linkWallet(walletAddress, nonce, signature);

        toast({
          title: "Wallet vinculada",
          description: "Ya puedes reclamar tus licencias on-chain.",
        });
      } else {
        await api.auth.verify(walletAddress, nonce, signature);

        toast({
          title: "Wallet conectada",
          description: "Sesion autenticada correctamente.",
        });
      }

      setLocalAddress(walletAddress);
      setChainId(currentChainId);

      // Releer del backend: `user.wallet` pasa a ser la fuente de verdad.
      await refresh();
    } catch (err) {
      console.error(err);

      toast({
        title: "Error al conectar",
        description:
          err?.message ?? "No se pudo conectar o autenticar la wallet.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast, isAuthenticated, refresh]);

  const disconnect = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error("Error cerrando sesión:", err);
    }

    setLocalAddress(null);
    setChainId(null);
    await refresh();
  }, [refresh]);

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWallet debe usarse dentro de <WalletProvider>");
  }

  return context;
}
