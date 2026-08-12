"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
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
                  <Link
                    href={`/${locale}/bailleur/factures/${f.id}`}
                    className="font-medium text-navy underline-offset-2 hover:underline"
                  >
                    {f.type}
                  </Link>
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
