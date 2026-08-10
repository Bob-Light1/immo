"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatDate, formatPeriodeFacture } from "@/lib/format";
import { Card, PubBadge, Spinner, EmptyState, Pager, inputCls } from "@/components/ui";
import { ExportFactures } from "@/components/ExportFactures";

const PAGE_SIZE = 20;

interface FactureRow {
  id: string;
  type: string;
  montantTotal: number;
  mois: string;
  dateLimite: string;
  statutPub: "brouillon" | "publiee";
  _count: { lignes: number };
}

/** Bailleur view: every invoice, read-only. */
export default function BailleurFacturesPage() {
  const t = useTranslations("factures");
  const locale = useLocale();
  const [factures, setFactures] = useState<FactureRow[] | null>(null);
  const [mois, setMois] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setFactures(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (mois) params.set("mois", mois);
    apiFetch(`/api/factures?${params}`).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { items: FactureRow[]; total: number };
        setFactures(data.items);
        setTotal(data.total);
      }
    });
  }, [mois, page]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={mois}
            onChange={(e) => {
              setMois(e.target.value);
              setPage(1);
            }}
            className={`${inputCls} w-auto`}
            aria-label={t("mois")}
          />
          <ExportFactures mois={mois} />
        </div>
      </div>

      {!factures ? (
        <Spinner />
      ) : factures.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("mois")}</th>
                <th className="px-4 py-3 text-right">{t("montantTotal")}</th>
                <th className="px-4 py-3">{t("dateLimite")}</th>
                <th className="px-4 py-3">{t("locataires")}</th>
                <th className="px-4 py-3">{t("statut")}</th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/bailleur/factures/${f.id}`}
                      className="font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {f.type}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatPeriodeFacture(f.type, f.mois, locale)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatXAF(f.montantTotal, locale)}</td>
                  <td className="px-4 py-3">{formatDate(f.dateLimite, locale)}</td>
                  <td className="px-4 py-3 text-center">{f._count.lignes}</td>
                  <td className="px-4 py-3">
                    <PubBadge statut={f.statutPub} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
