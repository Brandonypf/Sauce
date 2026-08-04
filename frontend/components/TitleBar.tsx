"use client";

/**
 * Barra de título decorativa (custom chrome), NO controles nativos del SO.
 * En Tauri, la ventana real se abre sin decoraciones (decorations: false en
 * tauri.conf.json) y esta barra es la que el usuario ve y usa para
 * cerrar/minimizar/maximizar, vía los comandos de la API de ventana de Tauri.
 */
export function TitleBar({ active }: { active: "catálogo" | "creadores" | "biblioteca" }) {
  const items: Array<"catálogo" | "creadores" | "biblioteca"> = [
    "catálogo",
    "creadores",
    "biblioteca",
  ];

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 glass border-b border-white/10"
      data-tauri-drag-region
    >
      <button
        aria-label="cerrar ventana"
        className="traffic-dot bg-[#ff5f57]"
        onClick={() => window.dispatchEvent(new CustomEvent("sauce:window-close"))}
      />
      <button
        aria-label="minimizar ventana"
        className="traffic-dot bg-[#febc2e]"
        onClick={() => window.dispatchEvent(new CustomEvent("sauce:window-minimize"))}
      />
      <button
        aria-label="maximizar ventana"
        className="traffic-dot bg-[#28c840]"
        onClick={() => window.dispatchEvent(new CustomEvent("sauce:window-maximize"))}
      />

      <nav className="ml-4 flex gap-5 text-[13px] text-white/55">
        {items.map((item) => (
          <span key={item} className={item === active ? "text-white/90" : ""}>
            {item}
          </span>
        ))}
      </nav>

      <button className="ml-auto flex items-center gap-1.5 rounded-[10px] border border-white/20 bg-white/10 px-4 py-1.5 text-xs backdrop-blur-glass">
        conectar wallet
      </button>
    </div>
  );
}
