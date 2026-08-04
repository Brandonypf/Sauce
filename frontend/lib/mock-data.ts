import type { ContentCategory, ContentWork, Creator } from "@/types";

export const creators: Creator[] = [
  {
    address: "0x5c554263A55a59adb30f6eeDB978EEf252dd0d72",
    handle: "nekomori",
    name: "Nekomori Studio",
    bio: "Estudio independiente de visual novels de terror psicológico y drama. Historias que se quedan contigo.",
    workCount: 8,
    followerCount: 1240,
  },
  {
    address: "0x9c3A2b7D41E5f8C0a1b9D4E6F3A2B1C0D9E8F7A6",
    handle: "hanami",
    name: "Hanami Draws",
    bio: "Ilustradora digital. Mangas y arte de personajes con estética slice-of-life.",
    workCount: 5,
    followerCount: 860,
  },
  {
    address: "0x1B2C3D4E5F60718293A4B5C6D7E8F9A0B1C2D3E4",
    handle: "koigokoro",
    name: "Koigokoro Games",
    bio: "Pequeño estudio que hace juegos de romance con decisiones que importan.",
    workCount: 3,
    followerCount: 2100,
  },
  {
    address: "0x7A6B5C4D3E2F1A0B9C8D7E6F5A4B3C2D1E0F9A8",
    handle: "yurei",
    name: "Yurei Audio",
    bio: "Compositor de bandas sonoras para visual novels y doujinshi.",
    workCount: 6,
    followerCount: 430,
  },
];

function cover(seed: string) {
  return `https://picsum.photos/seed/${seed}/600/800`;
}

function screenshot(seed: string, n: number) {
  return `https://picsum.photos/seed/${seed}-${n}/1280/720`;
}

export const works: ContentWork[] = [
  {
    id: 1,
    slug: "hoshizora-no-kanata",
    title: "Hoshizora no Kanata",
    creator: creators[0],
    category: "visual-novel",
    description:
      "Una visual novel de ciencia ficción sobre un farero que recibe transmisiones de un mundo que no existe.",
    synopsis:
      "En la costa de una ciudad que ya no aparece en los mapas, Taro mantiene un faro que nadie parece ver. Una noche, recibe una transmisión en morse desde un lugar llamado Hoshizora no Kanata, un archipiélago que se hundió hace cuarenta años. A partir de ese momento, el farero deberá decidir si el mensaje viene del mar, del cielo, o de su propia memoria. Cinco finales, cero decisiones triviales.",
    price: "25.00",
    currency: "PEN",
    coverUrl: cover("hoshizora"),
    screenshots: [
      screenshot("hoshizora", 1),
      screenshot("hoshizora", 2),
      screenshot("hoshizora", 3),
      screenshot("hoshizora", 4),
    ],
    tags: ["Ciencia ficción", "Drama", "Terror leve"],
    language: "Español (LATAM)",
    duration: "12–18 horas",
    engine: "Ren'Py",
    createdAt: "2026-07-28",
    licenseCount: 342,
  },
  {
    id: 2,
    slug: "sakura-ni-chikau",
    title: "Sakura ni Chikau",
    creator: creators[1],
    category: "manga",
    description:
      "Un manga one-shot sobre dos estudiantes que comparten el mismo banco en el último año de secundaria.",
    synopsis:
      "Rin y Aoi siempre se sentaron en el mismo banco bajo el cerezo. El último año, cuando los pétalos empiezan a caer, cada una descubre un secreto que cambiará la forma en que recuerdan todos los días anteriores. Un one-shot de 48 páginas en tinta y acuarela.",
    price: "0.00",
    currency: "PEN",
    coverUrl: cover("sakura"),
    screenshots: [
      screenshot("sakura", 1),
      screenshot("sakura", 2),
      screenshot("sakura", 3),
    ],
    tags: ["Slice of life", "Romance", "One-shot"],
    language: "Español (LATAM)",
    createdAt: "2026-07-25",
    licenseCount: 510,
  },
  {
    id: 3,
    slug: "kaeru-no-uta",
    title: "Kaeru no Uta",
    creator: creators[2],
    category: "game",
    description:
      "Un juego de romance con decisiones: eres un músico que vuelve a tu pueblo y encuentra tres cartas sin abrir.",
    synopsis:
      "Después de años en la ciudad, vuelves a tu pueblo natal para tocar en el festival. En la habitación de tu infancia hay tres cartas que nunca abriste. Cada una lleva a una historia diferente, y cada historia exige un sacrificio. Kaeru no Uta es un juego corto (3 horas) con tres rutas completas.",
    price: "12.00",
    currency: "PEN",
    coverUrl: cover("kaeru"),
    screenshots: [
      screenshot("kaeru", 1),
      screenshot("kaeru", 2),
      screenshot("kaeru", 3),
    ],
    tags: ["Romance", "Decisiones", "Música"],
    language: "Español (LATAM)",
    duration: "3–4 horas",
    engine: "Unity",
    createdAt: "2026-07-20",
    licenseCount: 890,
  },
  {
    id: 4,
    slug: "neko-no-machi",
    title: "Neko no Machi",
    creator: creators[0],
    category: "illustration",
    description:
      "Set de 24 ilustraciones de la ciudad de los gatos, una versión onírica de Lima.",
    synopsis:
      "¿Qué pasa si la ciudad donde creciste se convierte, de noche, en el pueblo de los gatos? Esta colección explora los rincones de Lima transformados: el puente de los suspiros bajo la luna, el mercado en calma, los techos que son calles. 24 ilustraciones en alta resolución para uso personal y fondos de pantalla.",
    price: "8.00",
    currency: "PEN",
    coverUrl: cover("neko"),
    screenshots: [
      screenshot("neko", 1),
      screenshot("neko", 2),
      screenshot("neko", 3),
    ],
    tags: ["Ilustración", "Fantasía", "Set completo"],
    language: "Español (LATAM)",
    createdAt: "2026-07-15",
    licenseCount: 120,
  },
  {
    id: 5,
    slug: "tsuki-no-uta",
    title: "Tsuki no Uta",
    creator: creators[3],
    category: "music",
    description:
      "Banda sonora original de 14 pistas para visual novels de estilo japonés. Formato FLAC.",
    synopsis:
      "Una colección de piezas para piano, shamisen y sintetizadores analógicos. Tsuki no Uta acompaña escenas de despedida, festivales de verano y cartas que nunca se envían. 14 pistas en FLAC de 24 bits, sin DRM, para uso personal.",
    price: "15.00",
    currency: "PEN",
    coverUrl: cover("tsuki"),
    screenshots: [],
    tags: ["Banda sonora", "Ambient", "FLAC"],
    language: "Instrumental",
    duration: "52 min",
    createdAt: "2026-07-10",
    licenseCount: 230,
  },
  {
    id: 6,
    slug: "yokai-hakusho",
    title: "Yokai Hakusho",
    creator: creators[1],
    category: "manga",
    description:
      "Bestiario ilustrado de yokai peruanos: espíritus de los Andes que nunca estuvieron en el catálogo japonés.",
    synopsis:
      "¿Y si los yokai no vinieran solo del Japón rural? Este bestiario de 96 páginas fusiona el folclore andino con la estética del ukiyo-e: el Pishtaco como oni moderno, la Mama Rayhuana como kami de las acequias, el Muqui como tsukumogami del socavón. Cada entrada con historia, clasificación y nota del autor.",
    price: "18.00",
    currency: "PEN",
    coverUrl: cover("yokai"),
    screenshots: [
      screenshot("yokai", 1),
      screenshot("yokai", 2),
      screenshot("yokai", 3),
    ],
    tags: ["Bestiario", "Folclore", "Ukiyo-e"],
    language: "Español (LATAM)",
    createdAt: "2026-07-05",
    licenseCount: 410,
  },
  {
    id: 7,
    slug: "asagao-no-yakusoku",
    title: "Asagao no Yakusoku",
    creator: creators[2],
    category: "visual-novel",
    description:
      "Una visual novel de verano: 31 días, una tarea pendiente y una ciudad que desaparece.",
    synopsis:
      "La abuela de Sora le dejó 31 sobres, uno para cada día de agosto. Cada sobre contiene una tarea que parece absurda — regar una planta que no existe, ir al mercado sin mirar los precios, cantar una canción que nadie conoce. El último sobre dice: 'Vete antes del día 31'. Visual novel de 6 horas con final único pero memorable.",
    price: "0.00",
    currency: "PEN",
    coverUrl: cover("asagao"),
    screenshots: [
      screenshot("asagao", 1),
      screenshot("asagao", 2),
      screenshot("asagao", 3),
    ],
    tags: ["Verano", "Drama", "Familiar"],
    language: "Español (LATAM)",
    duration: "6–8 horas",
    engine: "Ren'Py",
    createdAt: "2026-06-30",
    licenseCount: 760,
  },
  {
    id: 8,
    slug: "midnight-diner-collection",
    title: "Kaidan Bar — Vol. 1",
    creator: creators[3],
    category: "music",
    description:
      "Jazz noir para escenas nocturnas de visual novels. Volumen 1: La hora del gato.",
    synopsis:
      "Ocho piezas de jazz minimalista pensadas para escenas de bar, investigaciones y conversaciones que ocurren después de medianoche. Grabado con una sola toma por pista, sin editar, como los mejores oyentes prefieren.",
    price: "9.00",
    currency: "PEN",
    coverUrl: cover("kaidan"),
    screenshots: [],
    tags: ["Jazz", "Nocturno", "Minimal"],
    language: "Instrumental",
    duration: "34 min",
    createdAt: "2026-06-22",
    licenseCount: 95,
  },
];

export const categoryLabels: Record<ContentCategory, string> = {
  "visual-novel": "Visual Novels",
  manga: "Mangas",
  game: "Juegos",
  illustration: "Ilustraciones",
  music: "Música",
};

export function getWorkBySlug(slug: string) {
  return works.find((w) => w.slug === slug);
}

export function getCreatorByHandle(handle: string) {
  return creators.find((c) => c.handle === handle);
}

export function getWorksByCreator(handle: string) {
  return works.filter((w) => w.creator.handle === handle);
}
