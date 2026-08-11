import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  // Una obra gratuita no pasa por la pantalla de pago: pedir una tarjeta por
  // algo que cuesta cero es confuso y, ademas, el backend no crea ninguna orden.
  const esGratis = Number(item?.priceMinor ?? 0) === 0;

  const [status, setStatus] = useState(esGratis ? "processing" : "payment");

  const handlePay = async () => {
    setError(null);
    setStatus("processing");

    try {
      const idempotencyKey = crypto.randomUUID();

      const checkout = await api.checkout.start(item.slug, idempotencyKey);

      // El backend decide, no el frontend: si devuelve `free: true` es que ya
      // creo el entitlement y no hay nada que pagar. Llamar a `dev.pay(null)`
      // daba 404 y dejaba al usuario con la obra concedida viendo un error.
      if (!checkout.free) {
        await api.dev.pay(checkout.orderId);
      }

      // Se invalidan tambien catalogo y ficha para que `owned` se actualice y
      // el boton cambie a JUGAR sin recargar.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        queryClient.invalidateQueries({ queryKey: ["works"] }),
        queryClient.invalidateQueries({ queryKey: ["work", item.slug] }),
      ]);

      setStatus("success");
      onComplete?.(item);
    } catch (err) {
      console.error("Error procesando compra:", err);
      // `displayMessage` expande el detalle de validacion del backend; sin el,
      // cualquier fallo se resumia en "Datos invalidos".
      setError(err?.displayMessage || err?.message || "No se pudo completar la compra.");

      // Una obra gratuita no tiene pantalla de pago a la que volver: se queda en
      // el error con opcion de reintentar, en vez de caer en un estado vacio.
      setStatus(esGratis ? "error" : "payment");
    }
  };

  /**
   * Una obra gratuita se concede sola al abrir el modal.
   *
   * `yaLanzado` evita que React 18 en modo estricto —que monta los efectos dos
   * veces en desarrollo— dispare dos peticiones. El backend es idempotente y la
   * segunda daria 409, pero el usuario veria un error por algo que fue bien.
   */
  const yaLanzado = useRef(false);

  useEffect(() => {
    if (!open || !esGratis || yaLanzado.current) return;

    yaLanzado.current = true;
    void handlePay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, esGratis]);

  useEffect(() => {
    if (!open) yaLanzado.current = false;
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);

    setTimeout(() => {
      setStatus(esGratis ? "processing" : "payment");
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
      <DialogContent>
        {status === "processing" && <ProcessingOverlay />}

        {status === "error" && (
          <div className="space-y-4 py-6 text-center">
            <p className="font-medium">No se pudo anadir a tu biblioteca</p>
            <p className="text-sm text-muted-foreground">{error}</p>

            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  yaLanzado.current = true;
                  void handlePay();
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

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
