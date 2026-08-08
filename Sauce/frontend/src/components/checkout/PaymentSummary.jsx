import { Separator } from "@/components/separator";

export function PaymentSummary({ item }) {
  const { title, creator, handle, price } = item ?? {};
  const amount = Number(price) || 0;

  return (
    <div className="rounded-lg border p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground">
        por {creator ?? `@${handle}`}
      </p>
      <Separator className="my-3" />
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Red (fee)</span>
          <span>$0.00</span>
        </div>
      </div>
      <Separator className="my-3" />
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>${amount.toFixed(2)} USDC</span>
      </div>
    </div>
  );
}
