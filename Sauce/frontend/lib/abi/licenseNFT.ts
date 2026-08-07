/**
 * Solo los fragmentos de LicenseNFT que usa el navegador.
 *
 * El ABI completo esta en `contracts/abi/LicenseNFT.json` y se regenera con
 * `contracts/script/export-abis.sh`. Aqui se copia a mano lo minimo porque el
 * frontend se exporta estatico y todo lo que se importe acaba en el bundle.
 *
 * Si cambia la firma de `redeem` en el contrato, hay que actualizar esto. Un ABI
 * desincronizado no falla al compilar: falla en tiempo de ejecucion con datos mal
 * codificados.
 */
export const licenseNFTAbi = [
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          { name: "to", type: "address" },
          { name: "contentId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "expiry", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "holder", type: "address" }],
  },
  {
    type: "function",
    name: "hasLicense",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "contentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const LICENSE_NFT_ADDRESS = (process.env.NEXT_PUBLIC_LICENSE_NFT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
