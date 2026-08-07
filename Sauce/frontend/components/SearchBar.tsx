"use client";

import { useState } from "react";

export function SearchBar({ onSearch }: { onSearch: (query: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="glass flex items-center gap-2 rounded-xl px-4 py-2.5">
      <span className="text-white/40 text-sm">buscar</span>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
        placeholder="busca en cualquier idioma: 'sombras de ginza', 'ginza no kage'..."
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
      />
    </div>
  );
}
