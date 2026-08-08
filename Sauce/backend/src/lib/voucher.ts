import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { env } from "../env.js";

/**
 * Firma de vouchers EIP-712.
 *
 * Esto reemplaza el "codigo de licencia" del diagrama original. Un codigo
 * aleatorio guardado en la base de datos hay que adivinarlo o robarlo, y obliga a
 * limitar intentos porque es un secreto compartido. Un voucher firmado no es un
 * secreto: se puede publicar entero. Solo sirve para la direccion que nombra, solo
 * una vez, y el contrato lo verifica sin consultar a nadie.
 *
 * El dominio y los tipos tienen que coincidir byte a byte con LicenseNFT.sol. Si
 * cambia el nombre del contrato, la version, la cadena o el orden de los campos,
 * las firmas dejan de validar y no hay mensaje de error que lo explique: el
 * contrato simplemente recupera otra direccion y responde InvalidSignature.
 */

export interface LicenseVoucher {
  orderId: Hex;
  to: Address;
  contentId: bigint;
  amount: bigint;
  expiry: bigint;
}

const DOMAIN_NAME = "SauceLicense";
const DOMAIN_VERSION = "1";

const types = {
  LicenseVoucher: [
    { name: "orderId", type: "bytes32" },
    { name: "to", type: "address" },
    { name: "contentId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

function domain() {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId: env.CHAIN_ID,
    verifyingContract: env.LICENSE_NFT_ADDRESS as Address,
  };
}

function issuerAccount() {
  if (!env.ISSUER_PRIVATE_KEY) {
    throw new Error(
      "ISSUER_PRIVATE_KEY no configurada. Sin ella no se pueden emitir licencias.",
    );
  }

  return privateKeyToAccount(env.ISSUER_PRIVATE_KEY as Hex);
}

export function issuerAddress(): Address {
  return issuerAccount().address;
}

export async function signVoucher(voucher: LicenseVoucher): Promise<Hex> {
  // Las wallets se guardan en minuscula para que el indice unico funcione, pero
  // viem exige una direccion bien formada. `getAddress` normaliza y, de paso,
  // lanza si lo que salio de la base no es una direccion valida — mejor fallar al
  // firmar que emitir un voucher que el contrato nunca podra verificar.
  return issuerAccount().signTypedData({
    domain: domain(),
    types,
    primaryType: "LicenseVoucher",
    message: { ...voucher, to: getAddress(voucher.to) },
  });
}

/**
 * Serializa el voucher para enviarlo al navegador.
 *
 * Los bigint no sobreviven a JSON.stringify, y `contentId` puede exceder
 * Number.MAX_SAFE_INTEGER. Van como string y el frontend los convierte de vuelta
 * antes de llamar al contrato.
 */
export function serializeVoucher(voucher: LicenseVoucher, signature: Hex) {
  return {
    orderId: voucher.orderId,
    to: voucher.to,
    contentId: voucher.contentId.toString(),
    amount: voucher.amount.toString(),
    expiry: voucher.expiry.toString(),
    signature,
  };
}

/** El orderId on-chain es bytes32; el de la base de datos es un uuid. */
export function orderIdToBytes32(uuid: string): Hex {
  const hex = uuid.replace(/-/g, "");
  return `0x${hex.padEnd(64, "0")}` as Hex;
}
