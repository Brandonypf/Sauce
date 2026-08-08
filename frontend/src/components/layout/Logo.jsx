import { Link } from "react-router-dom";

/**
 * Logo de SAUCE: la gota con la S.
 *
 * El rojo del archivo (#ED1C24 aprox.) es más saturado que el coral de la marca
 * (#D94F3D). No se corrige por código: reteñir un logo con filtros CSS lo degrada
 * y encima lo desalinea del que uses en redes o en la tienda de aplicaciones. Si
 * quieres que coincidan, hay que exportar el logo en coral desde el archivo
 * original — o aceptar que el logo es más vivo que la interfaz, que también es
 * una decisión válida.
 *
 * Conviene además un SVG: en pantallas de alta densidad y a tamaños grandes el
 * PNG se ve blando, y el favicon lo necesita.
 */
export function Logo({ className = "", showWordmark = true }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 font-bold tracking-tight ${className}`}
      aria-label="SAUCE, ir al inicio"
    >
      <img
        src="/logo-sauce.png"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 object-contain"
      />
      {showWordmark && <span className="text-lg">SAUCE</span>}
    </Link>
  );
}
