# CLAUDE.md

Instrucciones para trabajar en `base44`.

## Stack

- Vite + React 18 (JSX, sin TypeScript estricto — se usa `.jsx`)
- Tailwind CSS 3 con variables CSS de shadcn/ui (`src/index.css`)
- `config.json` para configuración de la app
- `functions/` para backend, `entities/` para modelos de dominio

## Convenciones

- Usa el alias `@/` para importar desde `src/`.
- Los componentes de UI van en `src/components/ui/`.
- Mantén el diseño basado en tokens (`--primary`, `--muted`, etc.).
