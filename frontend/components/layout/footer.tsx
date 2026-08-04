import Link from "next/link";
import { Logo } from "./logo";

const columns = [
  {
    title: "Producto",
    links: [
      { label: "Explorar", href: "/explore" },
      { label: "Biblioteca", href: "/library" },
      { label: "Buscar", href: "/search" },
    ],
  },
  {
    title: "Comunidad",
    links: [
      { label: "Creadores", href: "/explore" },
      { label: "Cómo funciona", href: "/" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Términos", href: "#" },
      { label: "Privacidad", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-default bg-bg-surface">
      <div className="mx-auto grid max-w-shell gap-10 px-6 py-14 md:grid-cols-2 md:px-12 lg:px-16 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-small text-text-secondary">
            Historias que no encontrarás en ningún otro lado. Visual Novels, mangas y juegos indie
            de creadores hispanohablantes.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-caption font-medium uppercase tracking-wider text-text-tertiary">
              {col.title}
            </h3>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-small text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-default">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-4 px-6 py-6 md:px-12 lg:px-16">
          <p className="text-caption text-text-tertiary">
            © 2026 SAUCE. Hecho para la comunidad hispanohablante.
          </p>
          <p className="text-caption text-text-tertiary">
            Las obras pertenecen a sus creadores. Las licencias son verificables.
          </p>
        </div>
      </div>
    </footer>
  );
}
