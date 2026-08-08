import { Link } from "react-router-dom";

export function Logo({ className = "" }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 font-bold tracking-tight ${className}`}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-lg text-primary-foreground">
        S
      </span>
      <span>Sauce</span>
    </Link>
  );
}
