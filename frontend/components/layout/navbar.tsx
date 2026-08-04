"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "./logo";
import { WalletButton } from "./wallet-button";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Explorar", href: "/explore" },
  { label: "Biblioteca", href: "/library" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-[10] h-16 transition-colors duration-200",
        scrolled ? "glass border-b border-default" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-shell items-center justify-between px-6 md:px-12 lg:px-16">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="SAUCE — Inicio">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-small text-text-secondary transition-colors hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Buscar"
            onClick={() => router.push("/search")}
            className="hidden h-10 w-10 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary sm:inline-flex"
          >
            <Search className="h-4 w-4" />
          </button>
          <WalletButton />
          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="glass border-b border-default md:hidden">
          <div className="mx-auto flex max-w-shell flex-col gap-1 px-6 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-sm px-3 py-2 text-small text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
