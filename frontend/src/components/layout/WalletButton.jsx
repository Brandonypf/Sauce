import { Wallet } from "lucide-react";
import { Button } from "@/components/button";
import { useWallet } from "@/lib/wallet-context";
import { truncateAddress } from "@/lib/utils";

export function WalletButton() {
  const { address, chainId, isConnecting, connect, disconnect } = useWallet();

  if (!address) {
    return (
      <Button onClick={connect} disabled={isConnecting}>
        <Wallet className="mr-2 size-4" />
        {isConnecting ? "Conectando..." : "Conectar wallet"}
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={disconnect} title="Desconectar">
      <span className="size-2 rounded-full bg-emerald-500" />
      {truncateAddress(address)}
      {chainId ? ` · ${chainId}` : ""}
    </Button>
  );
}
