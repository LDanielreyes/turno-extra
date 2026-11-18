# Una sola imagen para la API y el worker. NO se probó el build en este entorno (sin Docker).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci && npx tsc -b && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
COPY start.sh ./start.sh
RUN chmod +x start.sh
USER node
EXPOSE 3000
# Por defecto corre API + worker juntos (start.sh), pensado para un solo servicio gratuito en Render.
# Por separado:  API: node apps/api/dist/src/main.js · Worker: node apps/worker/dist/main.js
# Migrar:        node packages/db/dist/migrate-cli.js   (con MIGRATION_DATABASE_URL)
CMD ["bash", "start.sh"]
