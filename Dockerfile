# syntax=docker/dockerfile:1
# La imagen oficial de Node ofrece variantes linux/arm64, compatibles con Raspberry Pi 5.
FROM node:24-bookworm-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

COPY backend ./backend
COPY frontend ./frontend

# El backend sirve el export estático de Next desde /app/frontend/out.
RUN pnpm build \
  && pnpm --filter hotel-reservas-backend --prod deploy --legacy /opt/hotel-backend

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p /app/data /app/uploads /app/backups \
  && chown -R node:node /app

COPY --from=build --chown=node:node /opt/hotel-backend /app/backend
COPY --from=build --chown=node:node /app/frontend/out /app/frontend/out

USER node
WORKDIR /app/backend

EXPOSE 3000
VOLUME ["/app/data", "/app/uploads", "/app/backups"]

CMD ["node", "src/server.js"]
