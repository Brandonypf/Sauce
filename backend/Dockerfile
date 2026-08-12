# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Las migraciones se leen en tiempo de ejecucion, no se compilan.
COPY migrations ./migrations

# Usuario sin privilegios. Con `runAsNonRoot: true` en el pod, arrancar como root
# hace que Kubernetes rechace el contenedor directamente.
USER node

EXPOSE 4000

# dumb-init no hace falta: node como PID 1 recibe SIGTERM y el codigo lo maneja
# para cerrar conexiones en vuelo antes de salir.
CMD ["node", "dist/index.js"]
