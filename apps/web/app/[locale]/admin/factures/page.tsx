"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { FACTURE_TYPES } from "@campusgest/shared";
import { formatXAF, formatDate, formatPeriodeFacture } from "@/lib/format";
import {
  PubBadge,
  Spinner,
  EmptyState,
  Pager,
  TableCard,
  Thead,
  Th,
  Tr,
  Td,
  btnPrimary,
  inputCls,
} from "@/components/ui";
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
        <TableCard>
          <Thead>
            <Th>{t("type")}</Th>
            <Th>{t("mois")}</Th>
            <Th align="right">{t("montantTotal")}</Th>
            <Th>{t("dateLimite")}</Th>
            <Th align="center">{t("locataires")}</Th>
            <Th>{t("statut")}</Th>
          </Thead>
          <tbody>
            {factures.map((f) => (
              <Tr key={f.id} className="hover:bg-slate-50">
                <Td>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/${locale}/admin/factures/${f.id}`}
                      className="font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {f.type}
                    </Link>
                    {f.isReconducted && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {t("reconduite")}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>{formatPeriodeFacture(f.type, f.mois, locale)}</Td>
                <Td align="right" className="font-mono">
                  {formatXAF(f.montantTotal, locale)}
                </Td>
                <Td>{formatDate(f.dateLimite, locale)}</Td>
                <Td align="center">{f._count.lignes}</Td>
                <Td>
                  <PubBadge statut={f.statutPub} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
