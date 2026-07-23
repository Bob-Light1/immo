// Formats locaux : montants XAF (entiers) et dates, selon la locale active.

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

/** "2026-06" -> "juin 2026" selon la locale. */
export function formatMois(mois: string, locale: string): string {
  const [y, m] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

/** Mois courant au format YYYY-MM. */
export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}
