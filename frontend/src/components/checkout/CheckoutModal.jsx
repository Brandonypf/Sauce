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

export function CheckoutModal({ open, onOpenChange, item, onComplete }) {
  const [status, setStatus] = useState("payment");

  const handlePay = () => {
    setStatus("processing");
    setTimeout(() => {
      setStatus("success");
      onComplete?.(item);
    }, 1800);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => setStatus("payment"), 300);
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
          <SuccessView item={item} onDone={handleClose} />
        )}
        {status === "payment" && (
          <>
            <DialogHeader>
              <DialogTitle>Completar compra</DialogTitle>
              <DialogDescription>
                Elige cómo quieres pagar para desbloquear el contenido.
              </DialogDescription>
            </DialogHeader>
            <PaymentTabs item={item} onPay={handlePay} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
