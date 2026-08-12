"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatMois } from "@/lib/format";
import { Card, PageTitle, Spinner, EmptyState, Thead, Th, Tr, Td } from "@/components/ui";
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

      <Card className="overflow-hidden p-0">
        <h2 className="px-4 pt-5 font-semibold text-navy">{t("impayesTitle")}</h2>
        {d.impayes.length === 0 ? (
          <EmptyState>{t("noImpayes")}</EmptyState>
        ) : (
          <div className="mt-3 overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <Thead>
                <Th>{t("colLocataire")}</Th>
                <Th>{t("colFacture")}</Th>
                <Th align="right">{t("colReste")}</Th>
                <Th align="right">{t("colJours")}</Th>
              </Thead>
              <tbody>
                {d.impayes.map((r) => (
                  <Tr key={r.ligneId}>
                    <Td className="font-medium">{r.locataire}</Td>
                    <Td className="text-slate-500">
                      {r.type} · {formatMois(r.mois, locale)}
                    </Td>
                    <Td align="right" className="font-mono">
                      {formatXAF(r.reste, locale)}
                    </Td>
                    <Td align="right">
                      <span
                        className={
                          r.joursRetard > 0 ? "font-semibold text-red-600" : "text-slate-400"
                        }
                      >
                        {r.joursRetard > 0 ? t("joursRetard", { n: r.joursRetard }) : "—"}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
