import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-base)",
        foreground: "var(--text-primary)",
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        accent: {
          DEFAULT: "var(--accent-primary)",
          primary: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
        },
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        small: ["14px", { lineHeight: "1.5" }],
        body: ["16px", { lineHeight: "1.6" }],
        h3: ["18px", { lineHeight: "1.4" }],
        h2: ["24px", { lineHeight: "1.3" }],
        h1: ["32px", { lineHeight: "1.2" }],
        hero: ["48px", { lineHeight: "1.1" }],
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        lg: "16px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 12px rgba(0,0,0,0.06)",
        lg: "0 12px 32px rgba(0,0,0,0.10)",
        glow: "0 0 20px rgba(217,79,61,0.15)",
        "glow-success": "0 0 20px rgba(45,138,78,0.15)",
      },
      borderColor: {
        DEFAULT: "var(--border-default)",
        hover: "var(--border-hover)",
        focus: "var(--border-focus)",
      },
      maxWidth: {
        shell: "1280px",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "bounce-down": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(6px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "toast-in": "toast-in 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "bounce-down": "bounce-down 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
