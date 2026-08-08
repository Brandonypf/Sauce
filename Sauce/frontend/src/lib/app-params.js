export const APP_NAME = "Sauce";
export const APP_TAGLINE = "Contenido digital sin intermediarios";
export const APP_DESCRIPTION =
  "Compra y vende contenido digital con pagos instantáneos sobre Arbitrum.";

export const BASE_URL = import.meta.env.BASE_URL || "/";

export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "DEMO_SAUCE";

export const DEFAULT_CHAIN_ID = 421614;

export const CURRENCY = "USDC";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const LICENSE_NFT_ADDRESS =
  import.meta.env.VITE_LICENSE_NFT_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

/**
 * Formatos del catálogo. Coinciden uno a uno con el enum `work_format` de
 * Postgres (migración 002): si aquí aparece un formato que la base no conoce,
 * el filtro devuelve vacío sin error, que es la peor forma de fallar.
 */
export const WORK_FORMATS = [
  { value: "", label: "Todos" },
  { value: "game", label: "Juegos" },
  { value: "manga", label: "Manga" },
  { value: "visual_novel", label: "Novelas visuales" },
  { value: "artbook", label: "Artbooks" },
  { value: "audio", label: "Audio" },
];

/** Clasificación por edad. `adult` se oculta salvo que el usuario opte por verlo. */
export const AGE_RATINGS = {
  all_ages: "Todo público",
  teen: "+13",
  mature: "+17",
  adult: "+18",
};
