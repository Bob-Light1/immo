"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, getSession, downloadRecu } from "@/lib/client/session";
import { formatXAF, formatDate, formatMois } from "@/lib/format";
import type { LigneStatut, PaiementMode } from "@campusgest/shared";
import { Card, StatutBadge, Spinner, EmptyState } from "@/components/ui";

interface MaLigne {
  id: string;
  coefficient: number;
  montantDu: number;
  montantPaye: number;
  statut: LigneStatut;
  datePaiement: string | null;
  facture: {
    id: string;
    type: string;
    mois: string;
    dateLimite: string;
    montantTotal: number;
  };
  paiements: { id: string; montant: number; mode: PaiementMode; createdAt: string }[];
}

/** « Mes factures » : le locataire ne voit que ses propres lignes (factures publiées). */
export default function LocataireHomePage() {
  const t = useTranslations("locataire");
  const tF = useTranslations("factures");
  const tP = useTranslations("paiement");
  const locale = useLocale();
  const [lignes, setLignes] = useState<MaLigne[] | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    apiFetch(`/api/factures/locataire/${s.user.id}`).then(async (res) => {
      if (res.ok) setLignes(await res.json());
    });
  }, []);

  if (!lignes) return <Spinner />;

  const solde = lignes
    .filter((l) => l.statut !== "paye")
    .reduce((s, l) => s + (l.montantDu - l.montantPaye), 0);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-navy">{t("title")}</h1>

      <Card className="mb-6 flex items-center justify-between p-4">
        <span className="text-sm text-slate-600">{t("solde")}</span>
        <span className={`text-xl font-extrabold ${solde > 0 ? "text-red-600" : "text-emerald-600"}`}>
          {formatXAF(solde, locale)}
        </span>
      </Card>

      {lignes.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">{tF("type")}</th>
                <th className="px-4 py-3">{tF("mois")}</th>
                <th className="px-4 py-3 text-right">{t("montantDu")}</th>
                <th className="px-4 py-3 text-right">{t("montantPaye")}</th>
                <th className="px-4 py-3">{tF("dateLimite")}</th>
                <th className="px-4 py-3">{tF("statut")}</th>
                <th className="px-4 py-3">{t("recus")}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{l.facture.type}</td>
                  <td className="px-4 py-3">{formatMois(l.facture.mois, locale)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantDu, locale)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantPaye, locale)}</td>
                  <td className="px-4 py-3">{formatDate(l.facture.dateLimite, locale)}</td>
                  <td className="px-4 py-3">
                    <StatutBadge statut={l.statut} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {l.paiements.map((p) => (
                        <button
                          key={p.id}
                          className="text-left text-xs text-navy underline-offset-2 hover:underline"
                          onClick={() => downloadRecu(p.id)}
                        >
                          {tP("recu", { montant: formatXAF(p.montant, locale) })}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
