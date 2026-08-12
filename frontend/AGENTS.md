# AGENTS.md

## Contexto

- Proyecto `base44`: SPA Vite + React 18 + Tailwind CSS. Sin carpeta `src/` con estructura:
  - `src/api/` — llamadas a servicios/backend
  - `src/components/` — componentes React
  - `src/hooks/` — hooks personalizados
  - `src/lib/` — utilidades y helpers
  - `src/pages/` — páginas/vistas de la app
  - `src/utils/index.ts` — helpers generales (incluye `cn()`)
- Alias de importación `@/` → `src/`.
- Componentes de UI en `src/components/ui/` (shadcn/ui).

## Comandos

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
