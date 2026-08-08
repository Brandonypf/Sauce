"use client";

import { create } from "zustand";

/**
 * Cache de la biblioteca en memoria.
 *
 * Antes esto era la fuente de verdad: `ownedSlugs` persistido en localStorage, y
 * el panel de compra lo escribia tras un setTimeout. Cualquiera con la consola
 * abierta se regalaba el catalogo entero.
 *
 * Ahora la verdad es la tabla `entitlements` del backend, consultada en cada
 * acceso al contenido. Esto sobrevive solo mientras dura la pestaña y existe para
 * no repetir la misma peticion en cada navegacion — nada mas. Sin `persist`: si
 * el cache sobreviviera a la recarga volveria a parecer una fuente de verdad.
 */
interface LibraryState {
  ownedSlugs: string[];
  hydrated: boolean;
  setOwned: (slugs: string[]) => void;
  markOwned: (slug: string) => void;
  reset: () => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  ownedSlugs: [],
  hydrated: false,

  setOwned: (slugs) => set({ ownedSlugs: slugs, hydrated: true }),

  // Optimista tras una compra confirmada. El backend ya lo sabe; esto solo evita
  // que la interfaz parpadee mientras se revalida.
  markOwned: (slug) =>
    set((state) =>
      state.ownedSlugs.includes(slug) ? state : { ownedSlugs: [...state.ownedSlugs, slug] },
    ),

  reset: () => set({ ownedSlugs: [], hydrated: false }),
}));
