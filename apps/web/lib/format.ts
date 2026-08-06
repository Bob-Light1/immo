// Locale-aware formatting: XAF amounts (integers) and dates.

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
    new Date(y, m - 1, 1),
  );
}

/** Current month as YYYY-MM. */
export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}
