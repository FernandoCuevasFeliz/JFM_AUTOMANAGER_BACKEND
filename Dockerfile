# syntax=docker/dockerfile:1

# =============================================================================
# JFM AutoManager — Backend
#
# Build multi-etapa. La imagen final NO lleva TypeScript, ni tsx, ni el código
# fuente, ni herramientas de compilación: solo el JavaScript compilado y las
# dependencias de producción.
# =============================================================================

# Version FIJA, la misma que declara `.nvmrc`: lo que se prueba en local es
# exactamente lo que corre en el contenedor. Un tag flotante como `22-slim`
# cambiaría de version sin avisar entre dos builds.
#
# `bcrypt` v6 distribuye binarios precompilados para linux-x64 y linux-arm64,
# en variantes glibc Y musl, asi que tambien funciona con `22.23.2-alpine` si se
# busca una imagen mas pequena. Se deja Debian (bookworm-slim) por ser la
# opcion mas conservadora.
ARG NODE_VERSION=22.23.2-bookworm-slim


# -----------------------------------------------------------------------------
# Etapa 1 — Dependencias de producción
#
# Se instalan en la MISMA imagen base que la etapa final para que `node-gyp-build`
# elija el binario nativo correcto (glibc vs musl, x64 vs arm64) para el sistema
# donde realmente va a ejecutarse.
#
# No hacen falta python3/make/g++: `bcrypt` v6 usa `node-gyp-build`, que solo
# SELECCIONA un binario ya compilado de su carpeta `prebuilds/`. Si en el futuro
# se añade una dependencia nativa sin binarios precompilados, habrá que
# instalarlas en esta etapa (y solo en esta, para no engordar la imagen final).
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force


# -----------------------------------------------------------------------------
# Etapa 2 — Compilación de TypeScript
#
# Necesita las dependencias de desarrollo (typescript), pero NO el binario
# nativo de bcrypt: `tsc` solo consume sus tipos. De ahí `--ignore-scripts`.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build


# -----------------------------------------------------------------------------
# Etapa 3 — Imagen final
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# Producción de forma explícita: el logger solo carga `pino-pretty` (que es una
# dependencia de desarrollo y NO está en esta imagen) cuando NODE_ENV no es
# production. Cambiar esta variable dentro del contenedor haría fallar el
# arranque.
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist         ./dist
COPY --chown=node:node package.json ./

# La imagen de Node trae un usuario `node` sin privilegios. Ejecutar como root
# dentro del contenedor no aporta nada y amplía el daño de cualquier fallo.
USER node

EXPOSE 3000

# Liveness: ¿responde el proceso? Se usa /health y no /health/ready a propósito
# — si el healthcheck dependiera de la base de datos, un corte momentáneo de red
# marcaría el contenedor como enfermo y podría provocar reinicios en cadena.
# Para readiness (¿puede atender tráfico?) el orquestador debe sondear
# /health/ready, que sí verifica la base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Sin gestor de init: `server.ts` ya registra manejadores de SIGTERM y SIGINT y
# cierra el pool de Postgres ordenadamente, que es justo lo que envía
# `docker stop`.
CMD ["node", "dist/main/server.js"]
