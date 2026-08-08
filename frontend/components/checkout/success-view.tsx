"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuccessView({
  title,
  orderId,
  onClose,
}: {
  title: string;
  orderId: string | null;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-4 px-6 py-12 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>

      <div>
        <h3 className="text-h2 font-medium text-text-primary">¡Compra confirmada!</h3>
        <p className="mt-1 text-small text-text-secondary">
          {title} ya está en tu biblioteca.
        </p>
      </div>

      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="w-full">
          <Link href="/library/" onClick={onClose}>
            Ir a mi biblioteca
          </Link>
        </Button>

        {/*
          El recibo on-chain es opcional y deliberadamente secundario: el acceso ya
          funciona sin él. Ponerlo como acción principal haría creer que la compra
          está incompleta hasta reclamarlo.
        */}
        {orderId && (
          <Link
            href={`/verify/?order=${orderId}`}
            onClick={onClose}
            className="text-caption text-text-tertiary hover:text-text-secondary"
          >
            Reclamar recibo on-chain (opcional)
          </Link>
        )}
      </div>
    </motion.div>
  );
}
