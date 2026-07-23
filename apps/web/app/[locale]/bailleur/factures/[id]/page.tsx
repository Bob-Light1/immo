"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatDate, formatMois } from "@/lib/format";
import type { LigneStatut } from "@campusgest/shared";
import { Card, StatutBadge, PubBadge, Spinner } from "@/components/ui";

interface Ligne {
  id: string;
  coefficient: number;
  montantDu: number;
  montantPaye: number;
  statut: LigneStatut;
  datePaiement: string | null;
  locataire: { id: string; fullName: string };
}

interface FactureDetail {
  id: string;
  type: string;
  montantTotal: number;
  baseUnitaire: number;
  mois: string;
  dateLimite: string;
  statutPub: "brouillon" | "publiee";
  lignes: Ligne[];
}

/** Détail d'une facture pour le Bailleur : répartition complète, lecture seule. */
export default function BailleurFactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("factures.detail");
  const locale = useLocale();
  const [facture, setFacture] = useState<FactureDetail | null>(null);

  useEffect(() => {
    apiFetch(`/api/factures/${id}`).then(async (res) => {
      if (res.ok) setFacture(await res.json());
    });
  }, [id]);

  if (!facture) return <Spinner />;

  const totalPaye = facture.lignes.reduce((s, l) => s + l.montantPaye, 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {facture.type} — {formatMois(facture.mois, locale)}
        </h1>
        <PubBadge statut={facture.statutPub} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("montantTotal"), value: formatXAF(facture.montantTotal, locale) },
          { label: t("baseUnitaire"), value: formatXAF(facture.baseUnitaire, locale) },
          { label: t("encaisse"), value: formatXAF(totalPaye, locale) },
          { label: t("dateLimite"), value: formatDate(facture.dateLimite, locale) },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="mt-1 font-bold text-navy">{value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">{t("locataire")}</th>
              <th className="px-4 py-3">{t("coefficient")}</th>
              <th className="px-4 py-3 text-right">{t("montantDu")}</th>
              <th className="px-4 py-3 text-right">{t("montantPaye")}</th>
              <th className="px-4 py-3">{t("datePaiement")}</th>
              <th className="px-4 py-3">{t("statut")}</th>
            </tr>
          </thead>
          <tbody>
            {facture.lignes.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{l.locataire.fullName}</td>
                <td className="px-4 py-3">{l.coefficient}</td>
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantDu, locale)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantPaye, locale)}</td>
                <td className="px-4 py-3">
                  {l.datePaiement ? formatDate(l.datePaiement, locale) : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatutBadge statut={l.statut} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
