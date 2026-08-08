import { createContext, useCallback, useContext, useState } from "react";
import { useToast } from "@/components/use-toast";
import { api } from "@/api/client";

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
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    setIsConnecting(true);

    try {
      if (!window.ethereum) {
        await new Promise((resolve) => setTimeout(resolve, 600));

        setAddress(DEMO_ADDRESS);
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

      // 6. Verificar la firma y crear sesión en el backend
      await api.auth.verify(walletAddress, nonce, signature);

      // 7. Guardar estado local de wallet
      setAddress(walletAddress);
      setChainId(currentChainId);

      toast({
        title: "Wallet conectada",
        description: "Sesión autenticada correctamente.",
      });
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
  }, [toast]);

  const disconnect = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error("Error cerrando sesión:", err);
    }

    setAddress(null);
    setChainId(null);
  }, []);

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
