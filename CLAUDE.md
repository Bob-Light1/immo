# CampusGest

PWA for managing a university residence hall (Cameroon). Turborepo monorepo, npm workspaces, Node ≥ 20.
Currency is **XAF** (integer, no cents — stored as `BigInt`). Domain vocabulary is French; see `CampusGest_Conception_v2.pdf` (services reference its sections, e.g. `§5.1`).

## Layout

```
apps/web/          Next.js 14 App Router + Tailwind + next-intl + PWA
  app/[locale]/    Pages, one folder per role: admin/ bailleur/ locataire/
  app/api/         Route handlers (REST)
  components/      Client components (ui.tsx = shared primitives)
  lib/             auth, rbac, api, prisma, storage, pdf, push, realtime, rate-limit, audit
  lib/services/    Business logic, one file per domain
  messages/        fr.json | en.json | de.json
packages/db/       Prisma schema, migrations, seed
packages/shared/   Types, Zod schemas, pure calculations (+ vitest)
packages/workers/  BullMQ recurring jobs
```

## Commands

| Command | Use |
|---|---|
| `npm run dev` | All apps (turbo) — web on `:3000`, redirects to `/fr` |
| `npm run typecheck` / `lint` / `test` | Validation — run before declaring work done |
| `npm run db:generate` | Regenerate Prisma client (after schema edits) |
| `npm run db:migrate` / `db:seed` / `db:studio` | Migrate, seed admin, inspect |
| `docker compose up -d` | Postgres + Redis + MinIO (dev deps) |

Env is a single root `.env` loaded via `dotenv-cli`; see `.env.example`. Production: `docker-compose.prod.yml` + Caddy, `docs/DEPLOIEMENT.md`.

## Architecture rules

**Layering — never bypass.** Route handler → service → Prisma. Handlers only authenticate, validate, delegate, audit. No Prisma calls in route handlers or components; no `NextRequest`/`NextResponse` inside services.

**Route handler shape** (`app/api/**/route.ts`):

```ts
export const dynamic = "force-dynamic"; // any authenticated response

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");           // or requireAuth(req)
    const input = someSchema.parse(await req.json()); // Zod, from @campusgest/shared
    const result = await someService(user.sub, input);
    await audit(req, user.sub, "domain.action", "entity", id); // mutations only
    return json(result);
  });
}
```

- `handle()` (`lib/api.ts`) maps `AuthError`, `ServiceError`, `ZodError` to HTTP; nothing else should be caught.
- `json()` serializes `BigInt`/`Decimal` → number and `Date` → ISO. Always use it, never `NextResponse.json` on Prisma output.
- Services throw `ServiceError(status, message)`; `lib/rbac.ts` throws `AuthError`.

**Auth.** JWT access token in `Authorization: Bearer`, refresh token in an httpOnly cookie with rotation (`ver` claim invalidates on credential change). Roles: `admin`, `bailleur`, `locataire`. Optional TOTP 2FA.

**Validation.** Every Zod schema lives in `packages/shared/src/schemas.ts` and is shared by client and server. Shared types mirror the Prisma enums — update both when the schema changes.

**Money & calculations.** Pure financial logic belongs in `packages/shared/src/calculations.ts` with tests in `calculations.test.ts`. Invoice splitting distributes a total by coefficient using the largest-remainder method: `Σ montantDu === montantTotal` exactly, and every line stays within 1 XAF of its exact share. Ties break on input order, so callers must read lines with a deterministic `orderBy`. Never introduce floats into an amount path. Exception: `Loyer` invoices are a flat annual amount per tenant, not split (`isLoyer()`).

**Invoice rules.** `Facture.typeKey` is the accent- and case-folded `type` (`normalizeFactureType`) and is what every comparison, filter and dedup uses — never the raw label. One invoice per `(typeKey, mois)`; rent additionally allows only one per calendar year, and its deadline must span that year (`dateLimiteLoyerCoherente`). Rent is excluded from the monthly dashboard aggregates, which cover charges only. Amounts, months and deadlines are correctable only while `statutPub = "brouillon"`; a published invoice is financial history. A payment is never edited — it is cancelled (`cancelPaiement`), which removes the row, recomputes the balance from what survives, and leaves the audit log as the account of it. Balance writes are guarded on the balance that was read (`updateMany` + `increment`), never assigned.

**Month keys.** `YYYY-MM` strings come from `@campusgest/shared/dates` (`moisDe`, `moisCourant`, `moisDecale`), always derived from *local* components. Never re-derive one with `toISOString()`. Deploy with `TZ` set to the residence's zone.

**i18n.** No hardcoded user-facing strings. Add the key to all three of `fr.json`, `en.json`, `de.json`. `fr` is the default locale.

**Confirmations & feedback.** Every consequential action is guarded and its outcome announced, through `components/Toast.tsx` only — never `window.confirm`, `window.prompt` or `window.alert`. Use `useConfirmAction` (dialog → request → toast → `onDone`) rather than assembling the four by hand; `useConfirm` alone is for a guard with no request behind it, and `useDownload` for anything that produces a file, since a failed blob download is otherwise silent. `level` sets the bar: `info` for a reversible action, `danger` for an irreversible one, `critical` adds a `challenge` phrase to retype (invoice deletion). Collect a reason with `prompt`, not a separate dialog. Optimistic updates are applied in `onDone`, after the server agrees — never before. Forms keep their inline `ErrorText`; row and toolbar actions report through toasts.

**Workers.** Job logic lives in `packages/workers/src/jobs/*` (testable without Redis); `index.ts` only schedules. Schedules: `echeances` daily 07:00, `anniversaires` daily 08:00, `reconductions` monthly on the 1st at 06:00.

## Code conventions

- **All code comments in English, professional in tone.** Explain *why* — the invariant, the constraint, the non-obvious tradeoff — not what the line does. Keep them sparse; delete a comment rather than let it go stale. The whole codebase — source, config, Dockerfiles, `.env` files — was translated to English; never reintroduce a French comment.
- Identifiers and domain terms stay in French where they mirror the domain (`facture`, `locataire`, `montantDu`, `coefficient`) — do not anglicize existing names.
- TypeScript strict; no `any`. Prefer `type` imports. Named exports throughout.
- Match the surrounding file's style. Do not add libraries without asking.

## Before finishing

Run `npm run typecheck` and `npm run test` (`packages/shared` holds the calculation and date tests; `apps/web` holds the money-service tests, which mock Prisma and need no database). Prisma schema edits require `npm run db:generate` plus a migration.
