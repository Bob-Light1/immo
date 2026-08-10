// Month-key handling, shared by the web app, the workers and the pure
// calculations. Three independent implementations used to coexist (one on UTC
// components, two on local components); they disagreed during the first hours
// of every month, which is enough to file an invoice under the wrong month.
// Everything now goes through this module.
//
// The month key is a calendar label, not an instant: it is always derived from
// the *local* components of a date, i.e. from the operator's civil day. Deploy
// with TZ set to the residence's zone (Africa/Douala) so that server and
// residents share the same civil calendar.

/** Accepts a real calendar month only: 01..12 (a bare `\d{2}` let "2026-99" through). */
export const MOIS_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Month key ("2026-08") from a date, read from its local components. */
export function moisDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Current month key ("2026-08"). */
export function moisCourant(): string {
  return moisDe(new Date());
}

/** Month key `n` months away from `mois` ("2026-12" + 1 -> "2027-01"). */
export function moisDecale(mois: string, n: number): string {
  const [y, m] = mois.split("-").map(Number);
  return moisDe(new Date(y!, m! - 1 + n, 1));
}

/** Year of a month key: "2026-08" -> "2026". */
export function anneeDe(mois: string): string {
  return mois.slice(0, 4);
}

/**
 * First day of a month key, at UTC midnight — the frame `@db.Date` columns are
 * stored and read in, so comparisons against a deadline never drift by a day.
 */
export function premierJourUTC(mois: string): Date {
  const [y, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1));
}

/** Calendar day of a date in the UTC frame (for whole-day arithmetic). */
export function jourUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Calendar day of a date read from its local components, in the UTC frame. */
export function jourLocal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * The instant the operator's civil day starts (local midnight) — the lower
 * bound for "already done today" comparisons against a real timestamp column.
 * Distinct from `jourLocal`, which projects the same day into the UTC frame for
 * whole-day arithmetic: using that projection as an instant shifts the window
 * by the zone's offset and reopens the first hours of the day.
 */
export function debutJourLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * How far a deadline may sit from the month being invoiced. A deadline before
 * the month opens would make the invoice overdue the moment it is published
 * (the due-date job would fire J+n alerts immediately); one set years ahead is
 * a typo. Rent covers a whole year, hence the 13-month upper bound.
 */
export const DATE_LIMITE_MAX_MOIS = 13;

/** True when `date` is a coherent deadline for the `mois` being invoiced. */
export function dateLimiteCoherente(mois: string, date: Date): boolean {
  const debut = premierJourUTC(mois);
  const max = premierJourUTC(moisDecale(mois, DATE_LIMITE_MAX_MOIS));
  const jour = jourUTC(date);
  return jour >= debut.getTime() && jour <= max.getTime();
}

/**
 * A rent invoice carries a whole year of debt, so its deadline has to span that
 * year. Dating one at the end of the month it was filed under — the natural
 * reflex, and what nothing used to prevent — made the due-date job flag the
 * entire annual balance as overdue a month later, against a tenant paying
 * monthly exactly as agreed. Six months keeps calendar-year and academic-year
 * conventions both workable while ruling that mistake out.
 */
export const LOYER_ECHEANCE_MIN_MOIS = 6;

/** True when `date` can be the deadline of a rent invoice filed under `mois`. */
export function dateLimiteLoyerCoherente(mois: string, date: Date): boolean {
  if (!dateLimiteCoherente(mois, date)) return false;
  return jourUTC(date) >= premierJourUTC(moisDecale(mois, LOYER_ECHEANCE_MIN_MOIS)).getTime();
}
