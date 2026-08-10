import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().default(4000),

  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string(),

  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000"),

  SESSION_COOKIE: z
    .string()
    .default("sauce_session"),

  SESSION_TTL_HOURS: z
    .coerce.number()
    .default(24 * 7),

  CHAIN_ID: z
    .coerce.number()
    .default(421614),

  RPC_URL: z
    .string()
    .default("https://sepolia-rollup.arbitrum.io/rpc"),

  LICENSE_NFT_ADDRESS: z
    .string()
    .default("0x0000000000000000000000000000000000000000"),

  CONTENT_REGISTRY_ADDRESS: z
    .string()
    .default("0x0000000000000000000000000000000000000000"),

  // La llave que firma vouchers EIP-712.
  // Nunca sale de este proceso y jamas llega al navegador.
  ISSUER_PRIVATE_KEY: z
    .string()
    .optional(),

  // La llave que envia transacciones.
  RELAYER_PRIVATE_KEY: z
    .string()
    .optional(),

  VOUCHER_TTL_DAYS: z
    .coerce.number()
    .default(7),

  GATEWAY_WEBHOOK_SECRET: z
    .string()
    .default("dev-secret"),

  CONTENT_URL_TTL_SECONDS: z
    .coerce.number()
    .default(300),

  FX_PEN_TO_USDC: z
    .coerce.number()
    .default(0.27),

  // Almacenamiento.
  STORAGE_DRIVER: z
    .enum(["local", "s3"])
    .default("local"),

  STORAGE_LOCAL_DIR: z
    .string()
    .default("./storage"),

  PUBLIC_API_URL: z
    .string()
    .default("http://localhost:4000"),

  S3_BUCKET: z
    .string()
    .default("sauce"),

  S3_REGION: z
    .string()
    .default("auto"),

  S3_ENDPOINT: z
    .string()
    .default(""),

  S3_ACCESS_KEY_ID: z
    .string()
    .optional(),

  S3_SECRET_ACCESS_KEY: z
    .string()
    .optional(),

  // Tope por archivo.
  MAX_UPLOAD_BYTES: z
    .coerce.number()
    .default(8 * 1024 * 1024 * 1024),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);

export const isProd = env.NODE_ENV === "production";
