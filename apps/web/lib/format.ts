// Locale-aware formatting: XAF amounts (integers) and dates.

// The month key itself comes from @campusgest/shared: this module used to
// derive it from `toISOString()` (UTC) while the services and workers used
// local components, so the two disagreed for the first hours of every month.
export { moisCourant } from "@campusgest/shared";

import { anneeDe, isLoyer } from "@campusgest/shared";

export function formatXAF(montant: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "XAF",
    maximumFractionDigits: 0,
  }).format(montant);
}

export function formatDate(date: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    typeof date === "string" ? new Date(date) : date,
  );
}

/** "2026-06" -> "juin 2026" for the active locale. */
export function formatMois(mois: string, locale: string): string {
  const [y, m] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(y!, m! - 1, 1),
  );
}

/**
 * The period an invoice actually covers. Rent is a flat annual amount merely
 * filed under one month, so labelling it with that month read as a monthly
 * bill — the very confusion the rest of the rent handling exists to avoid.
 */
export function formatPeriodeFacture(type: string, mois: string, locale: string): string {
  return isLoyer(type) ? anneeDe(mois) : formatMois(mois, locale);
}
