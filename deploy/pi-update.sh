#!/usr/bin/env bash
# Actualiza únicamente un checkout limpio, conserva los datos persistentes y crea un backup antes.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/hotel-reservas/app}"
BRANCH="${1:-main}"

cd "$APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "El checkout tiene cambios locales; se cancela para no sobrescribirlos." >&2
  exit 1
fi

git fetch --prune origin "$BRANCH"
TARGET="origin/$BRANCH"
CURRENT="$(git rev-parse HEAD)"
NEXT="$(git rev-parse "$TARGET")"

if [ "$CURRENT" = "$NEXT" ]; then
  echo "Ya está en $NEXT; no hay actualización pendiente."
  exit 0
fi

if ! git merge-base --is-ancestor HEAD "$TARGET"; then
  echo "La actualización no es de avance rápido. Revísala manualmente." >&2
  exit 1
fi

echo "Creando backup de SQLite y uploads con la versión actual..."
docker compose exec -T app node src/scripts/backup.js

echo "Construyendo y arrancando la versión $NEXT..."
git merge --ff-only "$TARGET"
docker compose build --pull app
docker compose up -d --no-deps app

echo "Esperando el health check..."
for _ in $(seq 1 12); do
  APP_CONTAINER="$(docker compose ps -q app)"
  if [ -n "$APP_CONTAINER" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER")" = "healthy" ]; then
    docker compose exec -T app node src/scripts/verify-reservation-integrity.js
    echo "Actualización terminada en $NEXT"
    exit 0
  fi
  sleep 5
done

echo "El contenedor no quedó healthy. Consulta: docker compose logs --tail=200 app" >&2
exit 1
