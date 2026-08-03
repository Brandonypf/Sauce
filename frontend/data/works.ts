export type Work = {
  id: string;
  /** Título tal como lo publicó el creador. NUNCA se traduce ni se localiza. */
  title: string;
  author: string;
  priceEth: number | "free";
  coverColor: string;
  /**
   * Términos de búsqueda en distintos idiomas / romanizaciones / alias.
   * Estos NO se muestran en la UI, solo se usan para poder encontrar la obra
   * buscando en español, inglés, romaji, etc. sin alterar el título original.
   */
  searchTerms: string[];
};

export const works: Work[] = [
  {
    id: "kanade-station",
    title: "奏駅ステーション",
    author: "Studio Nokku",
    priceEth: 0.004,
    coverColor: "rgba(124,92,255,0.25)",
    searchTerms: [
      "kanade eki suteeshon",
      "estación kanade",
      "kanade station",
      "estacion kanade",
    ],
  },
  {
    id: "ginza-shadows",
    title: "銀座の影",
    author: "YomeiWorks",
    priceEth: "free",
    coverColor: "rgba(255,120,180,0.22)",
    searchTerms: [
      "ginza no kage",
      "sombras de ginza",
      "shadows of ginza",
      "ginza shadows",
    ],
  },
  {
    id: "last-train",
    title: "마지막 열차",
    author: "Hoshi Collective",
    priceEth: 0.006,
    coverColor: "rgba(90,200,220,0.22)",
    searchTerms: [
      "majimak yeolcha",
      "el último tren",
      "el ultimo tren",
      "the last train",
      "last train",
    ],
  },
];
