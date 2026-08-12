import "dotenv/config";

const names = [
  "CHAIN_ID",
  "RPC_URL",
  "CREATOR_REGISTRY_ADDRESS",
  "CONTENT_REGISTRY_ADDRESS",
  "LICENSE_NFT_ADDRESS",
  "SETTLEMENT_VAULT_ADDRESS",
  "USDC_ADDRESS",
  "ISSUER_PRIVATE_KEY",
  "RELAYER_PRIVATE_KEY",
  "DATABASE_URL",
];

const missing = names.filter((name) => !process.env[name]);
for (const name of names) {
  console.log(`${name}=${process.env[name] ? name.includes("PRIVATE_KEY") || name === "DATABASE_URL" ? "<CONFIGURADA>" : process.env[name] : "<FALTA>"}`);
}
if (missing.length) process.exit(1);
