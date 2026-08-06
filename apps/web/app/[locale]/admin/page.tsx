"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatDate, formatMois } from "@/lib/format";
import { Card, PageTitle, Spinner, EmptyState } from "@/components/ui";
import { FinanceChart } from "@/components/FinanceChart";

interface AdminDashboard {
  kpis: {
    locatairesActifs: number;
    facturesMois: number;
    tauxPaiement: number;
    impayesRetard: number;
    ticketsOuverts: number;
  };
  serie: { mois: string; facture: number; encaisse: number }[];
  modes: { mode: string; total: number }[];
  activite: { action: string; resource: string; user: string | null; createdAt: string }[];
  impayes: {
    ligneId: string;
    locataire: string;
    type: string;
    mois: string;
    reste: number;
    joursRetard: number;
    statut: string;
  }[];
}

/** Admin dashboard: KPIs, billed vs collected, unpaid, activity (§6.1). */
export default function AdminHomePage() {
  const t = useTranslations("dashboard");
  const tPay = useTranslations("paiement.modes");
  const locale = useLocale();
  const [d, setD] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    apiFetch("/api/dashboard").then(async (res) => {
      if (res.ok) setD((await res.json()) as AdminDashboard);
    });
  }, []);

  if (!d) return <Spinner />;

  const kpis = [
    { value: d.kpis.locatairesActifs, label: t("locatairesActifs") },
    { value: d.kpis.facturesMois, label: t("facturesMois") },
    { value: `${d.kpis.tauxPaiement}%`, label: t("tauxPaiement") },
    { value: d.kpis.impayesRetard, label: t("impayesRetard"), alert: d.kpis.impayesRetard > 0 },
    { value: d.kpis.ticketsOuverts, label: t("ticketsOuverts") },
  ];
  const maxMode = Math.max(1, ...d.modes.map((m) => m.total));

  return (
    <>
      <PageTitle>{t("titleAdmin")}</PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(({ value, label, alert }) => (
          <Card key={label} className="p-4 text-center">
            <div className={`text-2xl font-extrabold ${alert ? "text-red-600" : "text-navy"}`}>
              {value}
            </div>
            <div className="mt-1 text-xs text-slate-500">{label}</div>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold text-navy">{t("chartTitle")}</h2>
          <FinanceChart serie={d.serie} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-navy">{t("modesTitle")}</h2>
          {d.modes.length === 0 ? (
            <EmptyState>{t("noData")}</EmptyState>
          ) : (
            <div className="space-y-3">
              {d.modes.map((m) => (
                <div key={m.mode}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{tPay(m.mode)}</span>
                    <span className="font-mono text-navy">{formatXAF(m.total, locale)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-brand"
                      style={{ width: `${(m.total / maxMode) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-6 p-0">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-navy">{t("activiteTitle")}</h2>
          {d.activite.length === 0 ? (
            <EmptyState>{t("noData")}</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.activite.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">
                    <span className="font-medium">{a.user ?? "—"}</span>{" "}
                    <span className="text-slate-500">{a.action}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDate(a.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-navy">{t("raccourcis")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href={`/${locale}/admin/factures/new`}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-navy transition hover:border-brand"
            >
              {t("creerFacture")}
            </Link>
            <Link
              href={`/${locale}/admin/users`}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-navy transition hover:border-brand"
            >
              {t("creerUser")}
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
