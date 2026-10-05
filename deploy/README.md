# Dedicated Client Deployment

This application stays a single codebase. Each B2B client receives a dedicated Docker Compose project, PostgreSQL volume, environment file, domain, and backup directory.

## Create a Client

1. Copy `deploy/env.client.example` to `deploy/<client-slug>.env`.
2. Fill all secrets with client-specific values.
3. Run:

```bash
./deploy/deploy-client.sh bureau-atlas atlas.automateflow.pro
```

`CLIENT_SLUG` accepts only lowercase letters, numbers, and hyphens. Values such as `../../etc`, `CLIENT A`, `foo/bar`, and shell metacharacters are rejected.

## Backups

```bash
./deploy/backup-client.sh bureau-atlas
```

Backups use PostgreSQL custom format, are timestamped, validated with `pg_restore -l`, stored under the client's `INSTANCE_ROOT`, and pruned only within that client's backup directory.

## Restore

Restore defaults to a non-production target database:

```bash
./deploy/restore-client.sh bureau-atlas /opt/suivi-instances/bureau-atlas/backups/bureau-atlas_20261004T190000Z.dump suivi_restore_test
```

Do not overwrite a production database automatically. Validate the restored database first, then schedule a controlled cutover if needed.

## Operations

```bash
./deploy/check-client.sh bureau-atlas
```

The check script verifies Docker service state, `/api/health`, backup freshness, and disk usage. It is intentionally lightweight and can be called from cron, Uptime Kuma, Grafana, or external alerting later.

The edge reverse proxy, such as Caddy, should own public 80/443. PostgreSQL remains private inside the Docker network.
