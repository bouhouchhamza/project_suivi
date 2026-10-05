#!/usr/bin/env bash
set -euo pipefail

slug="${1:-}"
if [[ ! "$slug" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Invalid CLIENT_SLUG." >&2
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

backup_dir="${INSTANCE_ROOT}/backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${backup_dir}/${slug}_${timestamp}.dump"

docker compose --project-name "suivi-${slug}" --env-file "$env_file" -f deploy/docker-compose.client.yml \
  exec -T db pg_dump -U "${POSTGRES_USER:-suivi}" -d "${POSTGRES_DB:-suivi_projets}" -Fc > "$backup_file"

chmod 600 "$backup_file"
pg_restore -l "$backup_file" >/dev/null

find "$backup_dir" -type f -name "${slug}_*.dump" -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
echo "$backup_file"
