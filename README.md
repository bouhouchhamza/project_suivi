# Suivi des Projets

Application collaborative de suivi de projets pour bureau d'etudes.

## Architecture

- Web: Vue 3, TypeScript, Vite, served by Nginx in Docker.
- API: Express 5, TypeScript, JWT auth, Socket.IO.
- Database: PostgreSQL 16.
- ORM/migrations: Prisma.
- Excel import/export: ExcelJS. The Excel code is lazy-loaded by the web app.
- Docker services: `db`, one-shot `migrate`, `api`, `web`.

The final API runtime image is intended to contain `@prisma/client` only. Prisma CLI is used in build/migrate stages, not the runtime stage.

## Environment

Copy `.env.example` to `.env` for Docker Compose.

Required variables:

```env
APP_ENV=production
POSTGRES_PASSWORD=replace-this-database-password
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_NAME=Administrateur
ADMIN_EMAIL=admin@suivi.local
ADMIN_PASSWORD=replace-with-a-strong-bootstrap-password
CORS_ORIGIN=https://suivi.example.com
```

For local testing against the existing Docker volume, `.env` may use `APP_ENV=local` and the existing database password. Changing `POSTGRES_PASSWORD` does not change the password inside an already initialized PostgreSQL volume.

Production startup rejects placeholder or short `JWT_SECRET` values and requires an HTTPS `CORS_ORIGIN` when `APP_ENV=production`.

## Local Docker Startup

```bash
npm install
npm run db:generate
docker compose up -d --build
```

Open `http://localhost:8080`.

The API health endpoint is:

```bash
curl http://localhost:8080/api/health
```

## Development Startup

```bash
docker compose up -d db
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Web: `http://localhost:5173`

API: `http://localhost:4000/api/health`

## Admin Bootstrap

The API runtime runs:

```bash
node dist/seed-cli.js && node dist/server.js
```

`seed-cli.js` upserts the configured admin account. It does not overwrite an existing admin password. Business seed data remains an admin action unless `AUTO_SEED_PROJECTS=true`.

## Migrations

Before deployment:

```bash
npm run db:generate
npm run db:deploy
```

Docker runs migrations through the one-shot `migrate` service before starting the API.

Rollback guidance:

- Do not run `prisma migrate reset` on production data.
- Restore a verified backup into a separate/new database first.
- Point a staging API at the restored database and validate before changing production traffic.

## Backup

Create a custom-format PostgreSQL backup from the Docker deployment:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U suivi -d suivi_projets -Fc > backups/suivi_projets_$(date +%F_%H-%M-%S).dump
```

Verify a backup is non-empty:

```bash
ls -lh backups/*.dump
```

Restore to a separate/new database only:

```bash
docker compose exec -T db createdb -U suivi suivi_projets_restore
docker compose exec -T db pg_restore -U suivi -d suivi_projets_restore --clean --if-exists < backups/YOUR_BACKUP.dump
```

Do not restore destructively over the active database without an explicit rollback window and a fresh backup.

## Tests

```bash
npm test -w apps/api
npm test -w apps/web
npm run build
docker compose config
docker compose up -d --build
npm run test:e2e
```

Playwright defaults to `http://localhost:8080`.

## Security Notes

- Roles are resolved from the database on protected API requests.
- There is no public signup.
- Login throttling is in-memory and appropriate for a single VPS instance. Use a shared store or edge/WAF rate limit if running multiple API instances.
- Helmet, restricted CORS, JSON body limits, and generic production error responses are enabled.
- Known audit context: Prisma CLI may report a `deepmerge-ts` advisory in build/migration tooling. ExcelJS 4.4.0 currently pulls `uuid@8.3.2`. Do not downgrade ExcelJS to remove this advisory; classify it during `npm audit` review.

## Deployment Checklist

1. Set real `.env` values on the VPS; do not use placeholders.
2. Use `APP_ENV=production`.
3. Set `CORS_ORIGIN` to the public HTTPS frontend origin.
4. Keep PostgreSQL private; do not expose it publicly.
5. Run migrations before API startup.
6. Verify `docker compose ps -a`, API health, login, CRUD, realtime, import/export, and backup creation.
