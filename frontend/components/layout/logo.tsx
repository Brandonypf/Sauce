import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7"
        aria-hidden="true"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 2C10.5 2 6 6.5 6 12c0 7 8 18 10 18s10-11 10-18c0-5.5-4.5-10-10-10Z"
          fill="url(#sauce-grad)"
        />
        <path
          d="M11.5 9.5c1.5-2 5-2.5 7-1s1 4-1.5 5.5c-1.8 1.1-3.5 2.9-3 5.5 1 1.5 3 2 4.5 1"
          stroke="#FAF8F5"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <defs>
          <linearGradient id="sauce-grad" x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E85D4E" />
            <stop offset="1" stopColor="#C04433" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-h3 font-medium tracking-tight text-text-primary">SAUCE</span>
    </span>
  );
}
