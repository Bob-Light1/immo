# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Image de production de l'application web (Next.js 14, sortie "standalone").
# Build multi-étapes : deps+build → runtime minimal.
# Contexte de build attendu : RACINE du monorepo (voir docker-compose.prod.yml).
# ─────────────────────────────────────────────────────────────────────────────

# ── Étape 1 : dépendances + build ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# libc6-compat + openssl : requis par le moteur Prisma sur Alpine (musl).
RUN apk add --no-cache libc6-compat openssl

# Manifests d'abord pour profiter du cache de couches sur `npm ci`.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/workers/package.json packages/workers/package.json
RUN npm ci

# Code source complet.
COPY . .

# NEXT_PUBLIC_* est figé dans le bundle client AU BUILD → doit être connu ici.
# On matérialise un .env que le wrapper `dotenv -e ../../.env` du script de build
# saura lire (DATABASE_URL factice : non requise au build, sécurité si un module
# instancie le client Prisma pendant le "collecting page data").
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
RUN printf 'NEXT_PUBLIC_APP_URL=%s\nDATABASE_URL=postgresql://build:build@localhost:5432/build\n' \
      "$NEXT_PUBLIC_APP_URL" > .env

# Génère le client Prisma puis construit Next (turbo enchaîne generate → build).
RUN npm run db:generate && npm run build

# ── Étape 2 : runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Le serveur standalone doit écouter sur toutes les interfaces (réseau Docker).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN apk add --no-cache openssl

# Sortie standalone : serveur + node_modules tracés (structure du monorepo).
COPY --from=builder /app/apps/web/.next/standalone ./
# Assets statiques et fichiers publics (PWA, service worker, icônes).
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Moteur/query engine Prisma : souvent manqué par le file-tracing → copie explicite.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
