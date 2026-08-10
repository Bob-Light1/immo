"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatMois } from "@/lib/format";
import { Card, PageTitle, Spinner, EmptyState } from "@/components/ui";
import { FinanceChart } from "@/components/FinanceChart";
import { LoyerCard, type LoyerAnnuel } from "@/components/LoyerCard";

interface BailleurDashboard {
  kpis: {
    totalFactureMois: number;
    totalEncaisseMois: number;
    tauxRecouvrement: number;
    nbImpayes: number;
  };
  serie: { mois: string; facture: number; encaisse: number }[];
  loyer: LoyerAnnuel | null;
  impayes: {
    ligneId: string;
    locataire: string;
    type: string;
    mois: string;
    reste: number;
    joursRetard: number;
    statut: string;
    loyer: boolean;
  }[];
}

/** Bailleur dashboard: financial KPIs, trend, unpaid (§6.2). */
export default function BailleurHomePage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [d, setD] = useState<BailleurDashboard | null>(null);

  useEffect(() => {
    apiFetch("/api/dashboard").then(async (res) => {
      if (res.ok) setD((await res.json()) as BailleurDashboard);
    });
  }, []);

  if (!d) return <Spinner />;

  const kpis = [
    { value: formatXAF(d.kpis.totalFactureMois, locale), label: t("totalFactureMois") },
    { value: formatXAF(d.kpis.totalEncaisseMois, locale), label: t("totalEncaisseMois") },
    { value: `${d.kpis.tauxRecouvrement}%`, label: t("tauxRecouvrement") },
    { value: d.kpis.nbImpayes, label: t("nbImpayes"), alert: d.kpis.nbImpayes > 0 },
  ];

  return (
    <>
      <PageTitle>{t("titleBailleur")}</PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(({ value, label, alert }) => (
          <Card key={label} className="p-4 text-center">
            <div className={`text-xl font-extrabold ${alert ? "text-red-600" : "text-navy"}`}>
              {value}
            </div>
            <div className="mt-1 text-xs text-slate-500">{label}</div>
          </Card>
        ))}
      </div>

      <LoyerCard loyer={d.loyer} />

      <Card className="mb-6">
        <h2 className="font-semibold text-navy">{t("tendanceTitle")}</h2>
        <p className="mb-3 text-xs text-slate-500">{t("chargesOnly")}</p>
        <FinanceChart serie={d.serie} />
      </Card>

      <Card className="p-0">
        <h2 className="px-6 pt-5 font-semibold text-navy">{t("impayesTitle")}</h2>
        {d.impayes.length === 0 ? (
          <EmptyState>{t("noImpayes")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-y border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-6 py-2">{t("colLocataire")}</th>
                  <th className="px-4 py-2">{t("colFacture")}</th>
                  <th className="px-4 py-2 text-right">{t("colReste")}</th>
                  <th className="px-4 py-2 text-right">{t("colJours")}</th>
                </tr>
              </thead>
              <tbody>
                {d.impayes.map((r) => (
                  <tr key={r.ligneId} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-2 font-medium">{r.locataire}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.type} · {formatMois(r.mois, locale)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatXAF(r.reste, locale)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={r.joursRetard > 0 ? "font-semibold text-red-600" : "text-slate-400"}>
                        {r.joursRetard > 0 ? t("joursRetard", { n: r.joursRetard }) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
