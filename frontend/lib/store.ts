"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LibraryState {
  ownedSlugs: string[];
  addOwned: (slug: string) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      ownedSlugs: [],
      addOwned: (slug) =>
        set((state) =>
          state.ownedSlugs.includes(slug) ? state : { ownedSlugs: [...state.ownedSlugs, slug] },
        ),
    }),
    { name: "sauce-library" },
  ),
);
