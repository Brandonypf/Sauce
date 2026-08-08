import { createContext, useCallback, useContext, useState } from "react";
import { useToast } from "@/components/use-toast";

const DEMO_ADDRESS = "0x5c554263A55a59adb30f6eeDB978EEf252dd0d72";
const DEMO_CHAIN_ID = 421614;

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { toast } = useToast();
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        const chain = await window.ethereum.request({ method: "eth_chainId" });
        setAddress(accounts[0]);
        setChainId(parseInt(chain, 16));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
        setAddress(DEMO_ADDRESS);
        setChainId(DEMO_CHAIN_ID);
        toast({
          title: "Modo demo",
          description: "No se detectó una wallet; se usó una dirección de prueba.",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Error al conectar",
        description: err?.message ?? "No se pudo conectar la wallet.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ address, chainId, isConnecting, connect, disconnect }}
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
