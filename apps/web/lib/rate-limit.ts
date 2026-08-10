/**
 * Fixed-window, in-memory rate limiting (design §9: /auth/login 10 attempts
 * per 15 min per IP). Enough for a single-instance deployment (Docker VPS);
 * move it to Redis if the app ever scales to several instances.
 */
import { ServiceError } from "./api";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Write budget for one admin on the money endpoints (per minute). */
export const MUTATION_MAX = 30;
export const MUTATION_WINDOW_MS = 60_000;

/**
 * Guards a mutating endpoint, keyed by actor. Invoices and payments write
 * financial history: a runaway client (or a double-submitting form) should be
 * stopped before it reaches the database, not after.
 */
export function rateLimitMutation(scope: string, userId: string): void {
  const { ok, retryAfterSec } = rateLimit(
    `${scope}:${userId}`,
    MUTATION_MAX,
    MUTATION_WINDOW_MS,
  );
  if (!ok) {
    throw new ServiceError(
      429,
      `Trop de requêtes. Réessayez dans ${retryAfterSec} s.`,
      "generic.tropDeRequetes",
      { secondes: retryAfterSec },
    );
  }
}
