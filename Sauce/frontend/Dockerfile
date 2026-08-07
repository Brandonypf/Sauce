# syntax=docker/dockerfile:1
#
# El frontend es una exportacion estatica: no hay servidor de Next en produccion.
# Esta imagen solo compila y sirve archivos con nginx.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Las variables NEXT_PUBLIC_* se incrustan en el bundle en tiempo de compilacion,
# no se leen al arrancar. Cambiar de entorno obliga a reconstruir la imagen; por
# eso llegan como build args y no como variables del pod.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ARB_RPC
ARG NEXT_PUBLIC_LICENSE_NFT_ADDRESS
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ARB_RPC=$NEXT_PUBLIC_ARB_RPC \
    NEXT_PUBLIC_LICENSE_NFT_ADDRESS=$NEXT_PUBLIC_LICENSE_NFT_ADDRESS

RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
