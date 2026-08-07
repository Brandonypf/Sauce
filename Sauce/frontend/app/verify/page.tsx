"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useAccount, useWriteContract } from "wagmi";
import { api, ApiError, type ApiVoucher } from "@/lib/api";
import { licenseNFTAbi, LICENSE_NFT_ADDRESS } from "@/lib/abi/licenseNFT";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

/**
 * Reclamar el recibo on-chain.
 *
 * Esta pagina era un campo OTP de 5 digitos para "verificar tu correo", herencia
 * del prototipo. Con vouchers EIP-712 ese paso ya no existe y era ademas el peor
 * de los dos disenos: un codigo en la base de datos es un secreto compartido que
 * se puede adivinar, y obliga a limitar intentos.
 *
 * Un voucher firmado no es un secreto — se puede publicar entero. Solo sirve para
 * la direccion que nombra, solo una vez, y el contrato lo verifica sin consultar a
 * nadie. No hay nada que teclear: el backend ya lo firmo cuando entro el pago.
 *
 * Reclamarlo es opcional. El acceso al contenido no depende de esto; depende de
 * `entitlements` en el backend. Esto da una prueba que sobrevive a la plataforma.
 */
export default function VerifyPage() {
  const { address } = useAccount();
  const { authenticated, checking, signIn, signingIn, isConnected } = useSession();
  const { writeContractAsync } = useWriteContract();

  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [voucher, setVoucher] = React.useState<ApiVoucher | null>(null);
  const [title, setTitle] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);
  const [claiming, setClaiming] = React.useState(false);
  const [txHash, setTxHash] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (!id) {
      setError("Falta el identificador de orden");
      return;
    }
    setOrderId(id);
  }, []);

  React.useEffect(() => {
    if (!orderId || !authenticated) return;

    api.orders
      .get(orderId)
      .then(({ order, voucher: v }) => {
        setTitle(order.title);

        if (order.status !== "paid") {
          setError("Esta orden todavia no esta pagada");
          return;
        }

        if (!v) {
          // El registro on-chain de la obra aun no confirma, asi que no hay
          // contentId contra el que emitir. El acceso ya funciona igual.
          setError("El recibo aun no esta listo. Tu licencia ya es valida.");
          return;
        }

        if (v.cancelledAt) {
          setError("Este voucher fue anulado");
          return;
        }

        setVoucher(v);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la orden"));
  }, [orderId, authenticated]);

  const claim = async () => {
    if (!voucher || !orderId) return;

    setClaiming(true);
    setError(null);

    try {
      // Los bigint viajan como string en JSON: `contentId` puede pasar de
      // Number.MAX_SAFE_INTEGER. Se reconstruyen aqui, no antes.
      const hash = await writeContractAsync({
        abi: licenseNFTAbi,
        address: LICENSE_NFT_ADDRESS,
        functionName: "redeem",
        args: [
          {
            orderId: voucher.orderId as `0x${string}`,
            to: voucher.to as `0x${string}`,
            contentId: BigInt(voucher.contentId),
            amount: BigInt(voucher.amount),
            expiry: BigInt(voucher.expiry),
          },
          voucher.signature as `0x${string}`,
        ],
      });

      setTxHash(hash);

      // Solo registro para no volver a mostrar el boton. La verdad de si se
      // canjeo esta en la cadena, no en esta llamada.
      await api.orders.markRedeemed(orderId, hash).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]! : "No se pudo reclamar");
    } finally {
      setClaiming(false);
    }
  };

  if (checking) {
    return (
      <main className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
      </main>
    );
  }

  if (!isConnected || !authenticated) {
    return (
      <Shell title="Reclamar recibo">
        <p className="text-small text-text-secondary">
          {isConnected
            ? "Firma un mensaje para demostrar que esta wallet es tuya."
            : "Conecta tu wallet para continuar."}
        </p>
        {isConnected && (
          <Button className="mt-6" onClick={() => void signIn()} loading={signingIn}>
            Iniciar sesion
          </Button>
        )}
      </Shell>
    );
  }

  if (txHash) {
    return (
      <Shell title="Recibo reclamado" icon={<CheckCircle2 className="h-7 w-7 text-success" />}>
        <p className="text-small text-text-secondary">
          Tu licencia de {title} quedo registrada en Arbitrum.
        </p>
        <p className="mt-2 break-all text-caption text-text-tertiary">{txHash}</p>
        <Button asChild className="mt-6">
          <Link href="/library/">Volver a mi biblioteca</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title={title || "Reclamar recibo"}>
      {error && <p className="mb-4 text-small text-danger">{error}</p>}

      {voucher && address && voucher.to.toLowerCase() !== address.toLowerCase() && (
        <p className="mb-4 text-small text-danger">
          Este voucher fue emitido para otra direccion. Cambia de cuenta en tu wallet.
        </p>
      )}

      {voucher ? (
        <>
          <p className="text-small text-text-secondary">
            Ya tienes acceso a esta obra. Reclamar el recibo la registra a tu nombre en Arbitrum,
            donde nadie —ni nosotros— puede borrarla.
          </p>
          <Button className="mt-6 w-full" onClick={() => void claim()} loading={claiming}>
            Reclamar en Arbitrum
          </Button>
          <p className="mt-3 text-caption text-text-tertiary">
            Pagas solo el gas de la transaccion. Es opcional.
          </p>
        </>
      ) : (
        !error && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        )
      )}
    </Shell>
  );
}

function Shell({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-elevated">
        {icon ?? <ShieldCheck className="h-7 w-7 text-text-tertiary" />}
      </div>
      <h1 className="text-h1 font-medium">{title}</h1>
      <div className="mt-4">{children}</div>
    </main>
  );
}
