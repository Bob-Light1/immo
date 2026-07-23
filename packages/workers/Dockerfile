# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Image de production des jobs planifiés (BullMQ + tsx).
# Sert aussi de "runner" one-shot pour les tâches DB (migrate / seed) — voir
# docker-compose.prod.yml. Contexte de build : RACINE du monorepo.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/workers/package.json packages/workers/package.json
RUN npm ci

COPY . .
# Génère le client Prisma (utilisé par les workers, la migration et le seed).
RUN npm run db:generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
# Copie complète (source TS + node_modules incluant prisma/tsx) : les workers
# tournent via tsx, et les commandes migrate/seed réutilisent cette même image.
COPY --from=builder /app ./
USER node
# Commande par défaut : boucle des jobs récurrents (surchargée pour migrate/seed).
CMD ["npm", "run", "start", "-w", "@campusgest/workers"]
