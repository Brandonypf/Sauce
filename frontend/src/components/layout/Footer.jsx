import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-params";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/explore" className="hover:text-foreground">
            Explorar
          </Link>
          <Link to="/library" className="hover:text-foreground">
            Biblioteca
          </Link>
          <Link to="/register" className="hover:text-foreground">
            Crear cuenta
          </Link>
        </nav>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>
    </footer>
  );
}
