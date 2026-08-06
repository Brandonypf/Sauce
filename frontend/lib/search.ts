import { Work } from "@/data/works";

/**
 * Normaliza texto para comparar búsquedas sin importar acentos, mayúsculas
 * o espacios extra. No traduce ni transliteral nada: solo limpia el string
 * para hacer un match más tolerante.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .toLowerCase()
    .trim();
}

/**
 * Busca obras cuyo título original coincide con la query en su idioma,
 * o cuyos searchTerms (equivalentes en otros idiomas) coincidan.
 * El título que se muestra en la UI SIEMPRE es work.title, sin modificar.
 */
export function searchWorks(query: string, catalog: Work[]): Work[] {
  const q = normalize(query);
  if (!q) return catalog;

  return catalog.filter((work) => {
    const haystack = [work.title, work.author, ...work.searchTerms].map(
      normalize
    );
    return haystack.some((term) => term.includes(q));
  });
}
