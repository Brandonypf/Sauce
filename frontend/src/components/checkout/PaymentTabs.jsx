import { Wallet } from "lucide-react";
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

    toast({
      title: "Transacción enviada",
      description: "Procesando el pago…",
    });

    onPay?.();
  };

  const handleCardPay = async () => {
    onPay?.();
  };

  return (
    <Tabs defaultValue="card" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="card">
          Tarjeta
        </TabsTrigger>

        <TabsTrigger value="wallet">
          <Wallet className="mr-2 size-4" />
          Wallet
        </TabsTrigger>
      </TabsList>

      <TabsContent value="card" className="mt-4">
        <div className="space-y-4">
          <PaymentSummary item={item} />

          <CardForm onSubmit={handleCardPay} />
        </div>
      </TabsContent>

      <TabsContent value="wallet" className="mt-4">
        <div className="space-y-4">
          <PaymentSummary item={item} />

          <button
            type="button"
            onClick={handleWalletPay}
            disabled={isConnecting}
            className="flex w-full items-center justify-center rounded-md border px-4 py-3 text-sm font-medium transition hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {isConnecting
              ? "Conectando…"
              : address
                ? `Pagar con ${address.slice(0, 6)}…${address.slice(-4)}`
                : "Conectar wallet para pagar"}
          </button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
