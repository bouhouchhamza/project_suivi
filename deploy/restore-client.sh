#!/usr/bin/env bash
set -euo pipefail

slug="${1:-}"
backup_file="${2:-}"
target_db="${3:-}"

if [[ ! "$slug" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Invalid CLIENT_SLUG." >&2
  exit 2
fi

if [[ ! -f "$backup_file" ]]; then
  echo "Backup file not found." >&2
  exit 2
fi

env_file="./deploy/${slug}.env"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file." >&2
  exit 2
fi

set -a
source "$env_file"
set +a

if [[ -z "$target_db" || "$target_db" == "${POSTGRES_DB:-suivi_projets}" ]]; then
  echo "Provide a non-production target database name for safe restore validation." >&2
  exit 2
fi

pg_restore -l "$backup_file" >/dev/null

docker compose --project-name "suivi-${slug}" --env-file "$env_file" -f deploy/docker-compose.client.yml \
  exec -T db createdb -U "${POSTGRES_USER:-suivi}" "$target_db" || true

cat "$backup_file" | docker compose --project-name "suivi-${slug}" --env-file "$env_file" -f deploy/docker-compose.client.yml \
  exec -T db pg_restore -U "${POSTGRES_USER:-suivi}" -d "$target_db" --clean --if-exists

echo "Restored into non-production database: $target_db"
