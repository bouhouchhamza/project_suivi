FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build


FROM build AS migrate

CMD ["npx", "prisma", "migrate", "deploy"]


FROM build AS prod-deps

RUN npm prune --omit=dev --omit=peer --no-audit --no-fund \
    && npm uninstall prisma --no-save --omit=dev --omit=peer --no-audit --no-fund


FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "node dist/seed-cli.js && node dist/server.js"]
