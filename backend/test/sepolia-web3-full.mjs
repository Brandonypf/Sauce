import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { pool } from "../src/db.js";
import { runOnce } from "../src/relayer/index.js";

const API = process.env.PUBLIC_API_URL || "http://127.0.0.1:4000";
const RPC = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CHAIN_ID = Number(process.env.CHAIN_ID || 421614);
const REGISTRY = process.env.CONTENT_REGISTRY_ADDRESS;
const LICENSE = process.env.LICENSE_NFT_ADDRESS;
const VAULT = process.env.SETTLEMENT_VAULT_ADDRESS;
const USDC = process.env.USDC_ADDRESS;
const CREATOR_REGISTRY = process.env.CREATOR_REGISTRY_ADDRESS;
const RELAYER_KEY = process.env.RELAYER_PRIVATE_KEY;
const CREATOR_KEY = process.env.CREATOR_PRIVATE_KEY;
const BUYER_KEY = process.env.BUYER_PRIVATE_KEY;

if (!RELAYER_KEY || !CREATOR_KEY || !BUYER_KEY) {
  console.error("Faltan RELAYER_PRIVATE_KEY, CREATOR_PRIVATE_KEY o BUYER_PRIVATE_KEY");
  process.exit(1);
}
if (!REGISTRY || !LICENSE || !VAULT || !USDC || !CREATOR_REGISTRY) {
  console.error("Faltan direcciones de contratos en backend/.env");
  process.exit(1);
}
if (CHAIN_ID !== 421614) throw new Error(`CHAIN_ID=${CHAIN_ID}; se esperaba 421614`);

const creator = privateKeyToAccount(CREATOR_KEY);
const buyer = privateKeyToAccount(BUYER_KEY);
const relayer = privateKeyToAccount(RELAYER_KEY);
const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });
const creatorWallet = createWalletClient({ account: creator, chain: arbitrumSepolia, transport: http(RPC) });
const buyerWallet = createWalletClient({ account: buyer, chain: arbitrumSepolia, transport: http(RPC) });

const licenseAbi = [{
  type: "function", name: "redeem", stateMutability: "nonpayable",
  inputs: [
    { name: "voucher", type: "tuple", components: [
      { name: "orderId", type: "bytes32" }, { name: "to", type: "address" },
      { name: "contentId", type: "uint256" }, { name: "amount", type: "uint256" },
      { name: "expiry", type: "uint64" },
    ]},
    { name: "signature", type: "bytes" },
  ], outputs: [{ name: "holder", type: "address" }],
}];
const creatorRegistryAbi = [
  { type: "function", name: "isRegisteredCreator", stateMutability: "view", inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "bool" }] },
];
const erc20Abi = [{
  type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }],
}];
const vaultAbi = [
  { type: "function", name: "accrued", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
];

function jarOfCookie(headers) {
  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(",").map((x) => x.split(";")[0]).join("; ");
}

async function call(method, path, { cookie = "", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { res, json, cookie: jarOfCookie(res.headers) };
}

function ok(condition, label, detail = "") {
  if (condition) console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
  else { console.log(`  FALLA ${label}${detail ? ` — ${detail}` : ""}`); failures += 1; }
}
let failures = 0;

console.log("━━ 0. ENTORNO WEB3 COMPLETO");
const chainId = await publicClient.getChainId();
ok(chainId === 421614, "RPC responde Arbitrum Sepolia", `chainId=${chainId}`);
ok(Boolean(await publicClient.getBytecode({ address: REGISTRY })), "ContentRegistry tiene bytecode", REGISTRY);
ok(creator.address.toLowerCase() !== relayer.address.toLowerCase(), "creator y relayer son distintas", `${creator.address} / ${relayer.address}`);
ok(buyer.address.toLowerCase() !== creator.address.toLowerCase(), "buyer y creator son distintas", `${buyer.address} / ${creator.address}`);

console.log("\n━━ 1. CONTENIDO ON-CHAIN EXISTENTE");
const registered = await publicClient.readContract({ address: CREATOR_REGISTRY, abi: creatorRegistryAbi, functionName: "isRegisteredCreator", args: [creator.address] });
ok(registered, "creator registrado on-chain", creator.address);

// Crea una cuenta compradora nueva y vincula su wallet con la misma firma que usa la web.
console.log("\n━━ 2. COMPRADOR + WALLET");
const email = `buyer-${randomUUID().slice(0, 8)}@sauce.test`;
const password = "una-frase-larga-y-seguraa";
const reg = await call("POST", "/api/auth/register", { body: { email, password } });
const cookie = reg.cookie;
ok(reg.res.status === 200, "cuenta comprador creada");
const nonceRes = await call("GET", "/api/auth/nonce");
const message = [
  "SAUCE quiere que inicies sesion con tu wallet.", "", `Direccion: ${buyer.address}`,
  `Nonce: ${nonceRes.json.nonce}`, "", "Firmar no cuesta gas y no autoriza ninguna transaccion.",
].join("\n");
const sig = await buyerWallet.signMessage({ message });
const linked = await call("POST", "/api/auth/link-wallet", { cookie, body: { address: buyer.address, nonce: nonceRes.json.nonce, signature: sig } });
ok(linked.res.status === 200, "wallet comprador vinculada", buyer.address);

// Reutiliza una obra publicada y pagada por la prueba 7.1, o busca la última publicada de precio > 0.
const works = await call("GET", "/api/works?limit=24");
const work = (works.json?.items || works.json?.works || []).find((w) => Number(w.priceMinor ?? w.price_minor ?? 0) > 0 && (w.contentId ?? w.content_id));
ok(Boolean(work), "existe una obra pagada ya registrada on-chain", work?.slug || "ninguna");
if (!work) {
  console.log("No hay obra pagada disponible; ejecuta primero verify:sepolia.");
  process.exit(1);
}

console.log("\n━━ 3. CHECKOUT + PAGO MOCK");
const idempotencyKey = randomUUID();
const checkout = await call("POST", "/api/checkout", { cookie, body: { slug: work.slug, idempotencyKey } });
ok(checkout.res.status === 200 && checkout.json?.orderId, "checkout creado", checkout.json?.orderId);
const orderId = checkout.json.orderId;
const paid = await call("POST", `/api/dev/pay/${orderId}`, { cookie });
ok(paid.res.status === 200 && paid.json?.orderId === orderId, "pago mock procesado", orderId);

console.log("\n━━ 4. VOUCHER EIP-712");
// Fuerza el procesamiento de issue_voucher para esta orden; no depende de otros jobs.
const voucherJob = await pool.query(
  `SELECT id FROM outbox WHERE kind = 'issue_voucher' AND payload->>'orderId' = $1 ORDER BY created_at DESC LIMIT 1`,
  [orderId],
);
if (voucherJob.rows[0]?.id) await runOnce(voucherJob.rows[0].id);
let order = (await call("GET", `/api/orders/${orderId}`, { cookie })).json;
ok(Boolean(order?.voucher?.signature), "voucher firmado por el issuer", order?.voucher?.contentId || "sin voucher");
ok(order?.voucher?.to?.toLowerCase() === buyer.address.toLowerCase(), "voucher dirigido al comprador", order?.voucher?.to || "");

console.log("\n━━ 5. LICENSE NFT — REDEEM REAL");
if (order?.voucher?.signature) {
  const v = order.voucher;
  const orderIdBytes = `0x${orderId.replaceAll("-", "").padEnd(64, "0")}`;
  const txHash = await buyerWallet.writeContract({
    address: LICENSE,
    abi: licenseAbi,
    functionName: "redeem",
    args: [{ orderId: orderIdBytes, to: buyer.address, contentId: BigInt(v.contentId), amount: 1n, expiry: BigInt(v.expiry) }, v.signature],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  ok(receipt.status === "success", "LicenseNFT.redeem confirmó", txHash);
  const marked = await call("POST", `/api/orders/${orderId}/redeemed`, { cookie, body: { txHash } });
  ok(marked.res.status === 200, "backend registró redeem", txHash);
} else {
  ok(false, "LicenseNFT.redeem", "no hay voucher");
}

console.log("\n━━ 6. SETTLEMENT REAL");
const usdcBalance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [relayer.address] });
ok(usdcBalance > 0n, "relayer tiene USDC para settlement", `${usdcBalance} unidades`);
if (usdcBalance > 0n) {
  const settleJob = await pool.query(
    `SELECT id FROM outbox WHERE kind = 'settle_order' AND payload->>'orderId' = $1 ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  if (settleJob.rows[0]?.id) await runOnce(settleJob.rows[0].id);
  let settled = false;
  const creatorAccrued = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "accrued", args: [creator.address] });
  const treasury = process.env.SAUCE_TREASURY;
  const treasuryAccrued = treasury ? await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "accrued", args: [treasury] }) : 0n;
  settled = creatorAccrued > 0n || treasuryAccrued > 0n;
  ok(settled, "SettlementVault acumula payout/fee", "revisa accrued() en cadena");
}

console.log("\nRESULTADO");
if (failures === 0) console.log("PASS — flujo Web3 de voucher + licencia + settlement verificado hasta donde permite el saldo USDC real.");
else console.log(`FAIL — ${failures} comprobaciones.`);
process.exitCode = failures ? 1 : 0;
