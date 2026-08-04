"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { WalletButton } from "@/components/layout/wallet-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function WalletPage() {
  const { isConnected, truncatedAddress } = useWallet();

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="text-h1 font-medium">Tu wallet</h1>
      <p className="mt-1 text-small text-text-secondary">
        Tu wallet es la llave de tu biblioteca. Cada obra que compras queda registrada como una
        licencia asociada a esta dirección.
      </p>

      <section className="mt-10 rounded-md border border-default bg-bg-surface p-8 text-center">
        {isConnected ? (
          <>
            <div
              className="mx-auto h-16 w-16 rounded-full"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 30% 30%, var(--accent-primary), var(--accent-hover))",
              }}
              aria-hidden="true"
            />
            <h2 className="mt-4 text-h3 font-medium">Wallet conectada</h2>
            <p className="mt-1 font-mono text-small text-text-secondary">{truncatedAddress}</p>
            <Badge variant="licensed" className="mt-4">
              Conectada a Arbitrum
            </Badge>
          </>
        ) : (
          <>
            <ShieldCheck className="mx-auto h-12 w-12 text-text-tertiary" />
            <h2 className="mt-4 text-h3 font-medium">Sin wallet conectada</h2>
            <p className="mx-auto mt-1 max-w-xs text-small text-text-secondary">
              Conecta tu wallet para comprar obras y ver tu biblioteca en cualquier dispositivo.
            </p>
            <div className="mt-6 flex justify-center">
              <WalletButton />
            </div>
          </>
        )}
      </section>

      <section className="mt-8 rounded-md border border-default bg-bg-surface p-6">
        <h2 className="text-h3 font-medium">¿Qué es una wallet?</h2>
        <p className="mt-3 text-small leading-relaxed text-text-secondary">
          Una wallet es como una cuenta digital que te pertenece solo a ti. En SAUCE, la usas para
          comprar licencias de obras: al comprar, la licencia queda asociada a tu wallet y puedes
          jugar desde donde quieras.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/explore">Explorar obras</Link>
        </Button>
      </section>
    </div>
  );
}
