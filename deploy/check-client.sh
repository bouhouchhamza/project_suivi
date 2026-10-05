#!/usr/bin/env bash
set -euo pipefail

slug="${1:-}"
if [[ ! "$slug" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Invalid CLIENT_SLUG." >&2
  exit 2
fi

env_file="./deploy/${slug}.env"
set -a
source "$env_file"
set +a

docker compose --project-name "suivi-${slug}" --env-file "$env_file" -f deploy/docker-compose.client.yml ps

web_url="http://${WEB_PORT:-127.0.0.1:18080}"
curl -fsS "${web_url}/api/health" >/dev/null

latest_backup="$(find "${INSTANCE_ROOT}/backups" -type f -name "${slug}_*.dump" -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
if [[ -z "$latest_backup" ]]; then
  echo "No backup found." >&2
  exit 3
fi

max_age_seconds=$(( (${BACKUP_RETENTION_DAYS:-14} + 1) * 86400 ))
backup_age=$(( $(date +%s) - $(stat -c %Y "$latest_backup") ))
if (( backup_age > max_age_seconds )); then
  echo "Latest backup is older than expected: $latest_backup" >&2
  exit 3
fi

disk_used="$(df -P "${INSTANCE_ROOT}" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if (( disk_used > 90 )); then
  echo "Low disk space warning: ${disk_used}% used." >&2
  exit 3
fi

echo "OK"
