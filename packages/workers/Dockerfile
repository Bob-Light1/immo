# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Production image of the scheduled jobs (BullMQ + tsx).
# Also serves as the one-shot "runner" for DB tasks (migrate / seed) — see
# docker-compose.prod.yml. Build context: the monorepo ROOT.
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
# Generate the Prisma client (used by the workers, the migration and the seed).
RUN npm run db:generate

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
# Full copy (TS sources + node_modules including prisma/tsx): the workers run
# through tsx, and the migrate/seed commands reuse this very image.
COPY --from=builder /app ./
USER node
# Default command: the recurring job loop (overridden for migrate/seed).
CMD ["npm", "run", "start", "-w", "@campusgest/workers"]
