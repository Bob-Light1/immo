# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Production image of the web application (Next.js 14, "standalone" output).
# Multi-stage build: deps+build → minimal runtime.
# Expected build context: the monorepo ROOT (see docker-compose.prod.yml).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependencies + build ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# libc6-compat + openssl: required by the Prisma engine on Alpine (musl).
RUN apk add --no-cache libc6-compat openssl

# Manifests first, to benefit from layer caching on `npm ci`.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/workers/package.json packages/workers/package.json
RUN npm ci

# Full source tree.
COPY . .

# NEXT_PUBLIC_* is frozen into the client bundle AT BUILD TIME → known here.
# So must S3_PUBLIC_URL be: Next resolves `headers()` at build and bakes the CSP
# into routes-manifest.json; missing here, the storage origin would never be
# allowed and images/documents would be blocked in production.
# A .env is materialized for the build script's `dotenv -e ../../.env` wrapper
# to read (dummy DATABASE_URL: not needed at build, a safety net in case a module
# instantiates the Prisma client while "collecting page data").
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG S3_PUBLIC_URL=
RUN printf 'NEXT_PUBLIC_APP_URL=%s\nS3_PUBLIC_URL=%s\nDATABASE_URL=postgresql://build:build@localhost:5432/build\n' \
      "$NEXT_PUBLIC_APP_URL" "$S3_PUBLIC_URL" > .env

# Generate the Prisma client then build Next (turbo chains generate → build).
RUN npm run db:generate && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The standalone server must listen on every interface (Docker network).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN apk add --no-cache openssl

# Standalone output: server + traced node_modules (monorepo layout).
COPY --from=builder /app/apps/web/.next/standalone ./
# Static assets and public files (PWA, service worker, icons).
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Prisma query engine: often missed by file tracing → copied explicitly.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
