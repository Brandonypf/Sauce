import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Play, WalletCards } from "lucide-react";
import { Button } from "@/components/button";
import { api } from "@/api/client";
import { useWallet } from "@/lib/wallet-context";

export function SuccessView({ item, order, onDone }) {
  const { address } = useWallet();
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(Boolean(order?.voucher?.redeemedAt));
  const [error, setError] = useState(null);

  const redeem = async () => {
    if (!order?.order?.id || !window.ethereum) {
      setError("Conecta una wallet para emitir la licencia on-chain.");
      return;
    }

    if (!address) {
      setError("Vincula una wallet a tu cuenta antes de emitir la licencia.");
      return;
    }

    setRedeeming(true);
    setError(null);
    try {
      const chainHex = await window.ethereum.request({ method: "eth_chainId" });
      if (parseInt(chainHex, 16) !== 421614) throw new Error("Cambia MetaMask a Arbitrum Sepolia.");

      const tx = await api.orders.redeemTx(order.order.id);
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: tx.to, data: tx.data }],
      });

      let receipt = null;
      for (let i = 0; i < 60 && !receipt; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        receipt = await window.ethereum.request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });
      }
      if (!receipt || receipt.status !== "0x1") throw new Error("La licencia no confirmó en cadena.");

      await api.orders.markRedeemed(order.order.id, txHash);
      setRedeemed(true);
    } catch (e) {
      setError(e?.displayMessage || e?.message || "No se pudo emitir la licencia.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-success-soft">
        <CheckCircle2 className="size-7 text-success" />
      </div>

      <div>
        <h3 className="text-xl font-bold">¡Listo!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ya tienes acceso a <span className="font-medium">{item?.title}</span>.
        </p>
      </div>

      {order?.voucher && !redeemed && (
        <div className="w-full max-w-sm rounded-xl border bg-card p-4 text-left">
          <div className="flex items-center gap-2 font-medium">
            <WalletCards className="size-4" />
            Licencia on-chain
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            El pago ya está confirmado. Puedes emitir ahora la licencia ERC-1155 en Arbitrum Sepolia.
          </p>
          <Button onClick={redeem} disabled={redeeming} className="mt-3 w-full">
            {redeeming ? "Confirmando en la wallet…" : "Emitir licencia"}
          </Button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )}

      {redeemed && (
        <p className="text-xs text-success">Licencia emitida on-chain correctamente.</p>
      )}

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="w-full bg-success text-white hover:bg-success/90">
          <Link to={`/reader/${item?.slug}`} onClick={onDone}>
            <Play className="size-4 fill-current" />
            Abrir contenido
          </Link>
        </Button>

        <Button asChild variant="outline" className="w-full">
          <Link to="/library" onClick={onDone}>Ir a mi biblioteca</Link>
        </Button>

        <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
          Seguir explorando
        </button>
      </div>
    </div>
  );
}
