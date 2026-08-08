import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { PaymentTabs } from "./PaymentTabs";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { SuccessView } from "./SuccessView";
import { api } from "@/api/client";

export function CheckoutModal({ open, onOpenChange, item, onComplete }) {
  const [status, setStatus] = useState("payment");
  const [error, setError] = useState(null);

  const handlePay = async () => {
    setError(null);
    setStatus("processing");

    try {
      const idempotencyKey = crypto.randomUUID();

      const checkout = await api.checkout.start(
        item.slug,
        idempotencyKey,
      );

      await api.dev.pay(checkout.orderId);

      setStatus("success");
      onComplete?.(item);
    } catch (err) {
      console.error("Error procesando compra:", err);
      setError(err?.message || "No se pudo completar la compra.");
      setStatus("payment");
    }
  };

  const handleClose = () => {
    onOpenChange(false);

    setTimeout(() => {
      setStatus("payment");
      setError(null);
    }, 300);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {status === "processing" && <ProcessingOverlay />}

        {status === "success" && (
          <SuccessView
            item={item}
            onDone={handleClose}
          />
        )}

        {status === "payment" && (
          <>
            <DialogHeader>
              <DialogTitle>Completar compra</DialogTitle>

              <DialogDescription>
                Elige cómo quieres pagar para desbloquear el contenido.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <p className="text-sm text-destructive">
                {error}
              </p>
            )}

            <PaymentTabs
              item={item}
              onPay={handlePay}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
