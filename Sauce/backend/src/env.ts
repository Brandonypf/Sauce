import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_COOKIE: z.string().default("sauce_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(24 * 7),

  CHAIN_ID: z.coerce.number().default(421614),
  RPC_URL: z.string().default("https://sepolia-rollup.arbitrum.io/rpc"),
  LICENSE_NFT_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),

  // La llave que firma vouchers EIP-712. Nunca sale de este proceso y jamas llega
  // al navegador: por eso el frontend no puede ser tambien el backend.
  ISSUER_PRIVATE_KEY: z.string().optional(),

  // La llave que envia transacciones. Distinta de la anterior a proposito: firmar
  // un voucher es gratis y sin estado, enviar una transaccion consume nonce.
  RELAYER_PRIVATE_KEY: z.string().optional(),

  VOUCHER_TTL_DAYS: z.coerce.number().default(7),
  GATEWAY_WEBHOOK_SECRET: z.string().default("dev-secret"),
  CONTENT_URL_TTL_SECONDS: z.coerce.number().default(300),
  FX_PEN_TO_USDC: z.coerce.number().default(0.27),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
