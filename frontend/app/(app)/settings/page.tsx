"use client";

import { useWallet } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/shared/toast-provider";

export default function SettingsPage() {
  const { isConnected, truncatedAddress } = useWallet();
  const { toast } = useToast();

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <h1 className="text-h1 font-medium">Configuración</h1>
      <p className="mt-1 text-small text-text-secondary">
        Administra tu cuenta y tus preferencias.
      </p>

      <section className="mt-10 rounded-md border border-default bg-bg-surface p-6">
        <h2 className="text-h3 font-medium">Cuenta</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-caption uppercase tracking-wider text-text-tertiary">
              Nombre público
            </label>
            <Input className="mt-1" defaultValue="Fan de SAUCE" />
          </div>
          <div>
            <label className="text-caption uppercase tracking-wider text-text-tertiary">
              Correo
            </label>
            <Input className="mt-1" type="email" placeholder="tucorreo@ejemplo.com" />
          </div>
          <div>
            <label className="text-caption uppercase tracking-wider text-text-tertiary">
              Wallet conectada
            </label>
            <p className="mt-1 text-small text-text-primary">
              {isConnected ? truncatedAddress : "No hay wallet conectada"}
            </p>
          </div>
        </div>
        <Button
          className="mt-6"
          onClick={() => toast("success", "Cambios guardados")}
        >
          Guardar cambios
        </Button>
      </section>
    </div>
  );
}
