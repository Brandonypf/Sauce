import { Wallet } from "lucide-react";
import { Button } from "@/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/components/use-toast";
import { CardForm } from "./CardForm";
import { PaymentSummary } from "./PaymentSummary";

export function PaymentTabs({ item, onPay }) {
  const { toast } = useToast();
  const { address, isConnecting, connect } = useWallet();

  const handleWalletPay = async () => {
    if (!address) {
      await connect();
      return;
    }
    toast({ title: "Transacción enviada", description: "Aprobando el pago…" });
    onPay?.();
  };

  return (
    <div className="space-y-4">
      <PaymentSummary item={item} />
      <Tabs defaultValue="card">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="card">Tarjeta</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
        </TabsList>
        <TabsContent value="card" className="pt-4">
          <CardForm onSubmit={onPay} />
        </TabsContent>
        <TabsContent value="wallet" className="pt-4">
          <Button
            className="w-full"
            variant="outline"
            disabled={isConnecting}
            onClick={handleWalletPay}
          >
            <Wallet className="mr-2 size-4" />
            {isConnecting
              ? "Conectando…"
              : address
                ? `Pagar con ${address.slice(0, 6)}…${address.slice(-4)}`
                : "Conectar wallet para pagar"}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
