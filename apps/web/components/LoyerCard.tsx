"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatXAF } from "@/lib/format";
import { Card } from "@/components/ui";

export interface LoyerAnnuel {
  annee: string;
  facture: number;
  encaisse: number;
  taux: number;
}

/**
 * Rent, reported on its own yearly scale.
 *
 * Rent is a flat annual amount filed under a single month, so counting it in
 * the monthly figures sank that month's collection rate and left a lone spike
 * in the trend. It is excluded from those aggregates and shown here instead —
 * the block simply disappears when no rent invoice has been published yet.
 */
export function LoyerCard({ loyer }: { loyer: LoyerAnnuel | null }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  if (!loyer) return null;

  const cells = [
    { value: formatXAF(loyer.facture, locale), label: t("loyerFacture") },
    { value: formatXAF(loyer.encaisse, locale), label: t("loyerEncaisse") },
    { value: `${loyer.taux}%`, label: t("loyerTaux") },
  ];

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-navy">{t("loyerTitle", { annee: loyer.annee })}</h2>
      <p className="mt-1 text-xs text-slate-500">{t("loyerHint")}</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        {cells.map(({ value, label }) => (
          <div key={label}>
            <div className="text-lg font-extrabold text-navy">{value}</div>
            <div className="mt-1 text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
