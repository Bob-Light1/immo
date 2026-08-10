"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  apiFetch,
  getSession,
  downloadRecu,
  downloadFactureLigne,
  type DownloadResult,
} from "@/lib/client/session";
import { formatXAF, formatDate, formatMois } from "@/lib/format";
import type { LigneStatut, PaiementMode } from "@campusgest/shared";
import { suiviLoyer } from "@campusgest/shared";
import { useDownload } from "@/components/Toast";
import { Card, StatutBadge, Spinner, EmptyState, Pager } from "@/components/ui";

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

const PAGE_SIZE = 20;

interface MesFactures {
  items: MaLigne[];
  /** Rent lines, always returned whole: yearly, and never paged away. */
  loyers: MaLigne[];
  solde: { charges: number; loyer: number };
  total: number;
}

/** "My invoices": a tenant only sees their own lines (published invoices). */
export default function LocataireHomePage() {
  const t = useTranslations("locataire");
  const tF = useTranslations("factures");
  const tP = useTranslations("paiement");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const download = useDownload();
  const [data, setData] = useState<MesFactures | null>(null);
  const [page, setPage] = useState(1);

  /**
   * No confirmation here: these documents are the reader's own, and a dialog on
   * every one would be friction without a decision behind it. What was missing
   * was the other half — a failed download produced no file and said nothing.
   */
  function print(run: () => Promise<DownloadResult>) {
    return download({ run, failure: tCommon("downloadFailed") });
  }

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    setData(null);
    apiFetch(`/api/factures/locataire/${s.user.id}?page=${page}&limit=${PAGE_SIZE}`).then(
      async (res) => {
        if (res.ok) setData((await res.json()) as MesFactures);
      },
    );
  }, [page]);

  if (!data) return <Spinner />;

  // Charges and rent are reported apart: rent is a yearly commitment settled by
  // instalments, so folding its outstanding balance into the same red figure
  // made a tenant paying exactly as agreed look deep in arrears.
  const { items: lignes, loyers, solde } = data;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-navy">{t("title")}</h1>

      <Card className="mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        {[
          { label: t("soldeCharges"), montant: solde.charges },
          { label: t("soldeLoyer"), montant: solde.loyer },
        ].map(({ label, montant }) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">{label}</span>
            <span
              className={`text-xl font-extrabold ${montant > 0 ? "text-red-600" : "text-emerald-600"}`}
            >
              {formatXAF(montant, locale)}
            </span>
          </div>
        ))}
      </Card>

      {loyers.map((l) => {
        const annee = l.facture.mois.slice(0, 4);
        const suivi = suiviLoyer({
          montantAnnuel: l.montantDu,
          montantPaye: l.montantPaye,
          paiements: l.paiements.map((p) => ({ montant: p.montant, date: p.createdAt })),
        });
        return (
          <Card key={l.id} className="mb-6 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy">{t("loyerTitle", { annee })}</h2>
              <button
                className="text-sm font-medium text-navy underline-offset-2 hover:underline"
                title={t("documentFr")}
                onClick={() => print(() => downloadFactureLigne(l.id, `loyer-${annee}`))}
              >
                {t("facturePdf")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t("loyerAnnuel"), value: formatXAF(l.montantDu, locale), accent: "text-navy" },
                { label: t("payeCeMois"), value: formatXAF(suivi.payeCeMois, locale), accent: "text-navy" },
                { label: t("payeAnnee", { annee }), value: formatXAF(suivi.payeAnnee, locale), accent: "text-emerald-600" },
                {
                  label: t("restantAnnee", { annee }),
                  value: formatXAF(suivi.restantAnnee, locale),
                  accent: suivi.restantAnnee > 0 ? "text-red-600" : "text-emerald-600",
                },
              ].map(({ label, value, accent }) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs uppercase text-slate-500">{label}</div>
                  <div className={`mt-1 font-bold ${accent}`}>{value}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

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
                <th className="px-4 py-3">{t("facture")}</th>
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
                    <button
                      className="text-left text-xs text-navy underline-offset-2 hover:underline"
                      title={t("documentFr")}
                      onClick={() =>
                        print(() => downloadFactureLigne(l.id, `${l.facture.type}-${l.facture.mois}`))
                      }
                    >
                      {t("facturePdf")}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {l.paiements.map((p) => (
                        <button
                          key={p.id}
                          className="text-left text-xs text-navy underline-offset-2 hover:underline"
                          title={t("documentFr")}
                          onClick={() => print(() => downloadRecu(p.id))}
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
      <Pager page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
