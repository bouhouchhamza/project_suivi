#!/usr/bin/env bash
set -euo pipefail

slug="${1:-}"
domain="${2:-}"

if [[ ! "$slug" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Invalid CLIENT_SLUG. Use lowercase letters, numbers, and single hyphens only." >&2
  exit 2
fi

if [[ -z "$domain" || "$domain" == *"/"* || "$domain" == *" "* ]]; then
  echo "Invalid domain." >&2
  exit 2
fi

env_file="./deploy/${slug}.env"
if [[ ! -f "$env_file" ]]; then
  echo "Create $env_file from deploy/env.client.example before deploying." >&2
  exit 2
fi

set -a
source "$env_file"
set +a

mkdir -p "${INSTANCE_ROOT}/backups"
chmod 700 "${INSTANCE_ROOT}" "${INSTANCE_ROOT}/backups"

docker compose \
  --project-name "suivi-${slug}" \
  --env-file "$env_file" \
  -f deploy/docker-compose.client.yml \
  up -d --build

docker compose \
  --project-name "suivi-${slug}" \
  --env-file "$env_file" \
  -f deploy/docker-compose.client.yml \
  ps
