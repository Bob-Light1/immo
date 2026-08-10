"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { FACTURE_TYPES } from "@campusgest/shared";
import { formatXAF, formatDate, formatPeriodeFacture } from "@/lib/format";
import { Card, PubBadge, Spinner, EmptyState, Pager, btnPrimary, inputCls } from "@/components/ui";
import { ExportFactures } from "@/components/ExportFactures";

const PAGE_SIZE = 20;

interface FactureRow {
  id: string;
  type: string;
  montantTotal: number;
  mois: string;
  dateLimite: string;
  statutPub: "brouillon" | "publiee";
  isReconducted: boolean;
  _count: { lignes: number };
}

export default function AdminFacturesPage() {
  const t = useTranslations("factures");
  const tStatut = useTranslations("statut");
  const locale = useLocale();
  const [factures, setFactures] = useState<FactureRow[] | null>(null);
  const [mois, setMois] = useState("");
  // The API has always filtered on type (accent- and case-folded) and on
  // publication status; only the month was ever reachable from here, so finding
  // the drafts left to publish meant paging through everything.
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setFactures(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (mois) params.set("mois", mois);
    if (type) params.set("type", type);
    if (statut) params.set("statut", statut);
    apiFetch(`/api/factures?${params}`).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { items: FactureRow[]; total: number };
        setFactures(data.items);
        setTotal(data.total);
      }
    });
  }, [mois, type, statut, page]);

  /** Any filter change resets to the first page: page 4 of a new filter is empty. */
  function filtrer(set: (v: string) => void) {
    return (v: string) => {
      set(v);
      setPage(1);
    };
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={mois}
            onChange={(e) => filtrer(setMois)(e.target.value)}
            className={`${inputCls} w-auto`}
            aria-label={t("mois")}
          />
          <input
            list="filtre-types"
            value={type}
            onChange={(e) => filtrer(setType)(e.target.value)}
            placeholder={t("type")}
            className={`${inputCls} w-36`}
            aria-label={t("type")}
          />
          <datalist id="filtre-types">
            {FACTURE_TYPES.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <select
            value={statut}
            onChange={(e) => filtrer(setStatut)(e.target.value)}
            className={`${inputCls} w-auto`}
            aria-label={t("statut")}
          >
            <option value="">{t("filtreTousStatuts")}</option>
            <option value="brouillon">{tStatut("brouillon")}</option>
            <option value="publiee">{tStatut("publiee")}</option>
          </select>
          <ExportFactures mois={mois} />
          <Link href={`/${locale}/admin/factures/new`} className={btnPrimary}>
            {t("create")}
          </Link>
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
                      href={`/${locale}/admin/factures/${f.id}`}
                      className="font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {f.type}
                    </Link>
                    {f.isReconducted && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {t("reconduite")}
                      </span>
                    )}
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
