"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, downloadFactureLigne } from "@/lib/client/session";
import { formatXAF, formatDate, formatPeriodeFacture } from "@/lib/format";
import type { LigneStatut } from "@campusgest/shared";
import { isLoyer, suiviLoyer } from "@campusgest/shared";
import { useDownload } from "@/components/Toast";
import {
  Card,
  StatutBadge,
  PubBadge,
  Spinner,
  TableCard,
  Thead,
  Th,
  Tr,
  Td,
  linkAction,
} from "@/components/ui";

interface Ligne {
  id: string;
  coefficient: number;
  montantDu: number;
  montantPaye: number;
  statut: LigneStatut;
  datePaiement: string | null;
  locataire: { id: string; fullName: string };
  paiements: { id: string; montant: number; createdAt: string }[];
}

interface FactureDetail {
  id: string;
  type: string;
  montantTotal: number;
  baseUnitaire: number;
  mois: string;
  dateLimite: string;
  statutPub: "brouillon" | "publiee";
  compteur: { id: string; libelle: string } | null;
  lignes: Ligne[];
}

/** Invoice detail for the Bailleur: full split, read-only. */
export default function BailleurFactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("factures.detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const download = useDownload();
  const [facture, setFacture] = useState<FactureDetail | null>(null);

  useEffect(() => {
    apiFetch(`/api/factures/${id}`).then(async (res) => {
      if (res.ok) setFacture(await res.json());
    });
  }, [id]);

  if (!facture) return <Spinner />;

  const totalPaye = facture.lignes.reduce((s, l) => s + l.montantPaye, 0);
  // Rent: flat annual amount per tenant; the Bailleur tracks how the year's
  // payments progress rather than a coefficient-based split.
  const loyer = isLoyer(facture.type);
  const annee = facture.mois.slice(0, 4);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {facture.type} — {formatPeriodeFacture(facture.type, facture.mois, locale)}
        </h1>
        <PubBadge statut={facture.statutPub} />
      </div>

      {facture.compteur && (
        <p className="-mt-4 mb-6 text-sm text-slate-500">
          {t("compteur")} : <span className="font-medium text-navy">{facture.compteur.libelle}</span>
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("montantTotal"), value: formatXAF(facture.montantTotal, locale) },
          {
            label: loyer ? t("loyerAnnuel") : t("baseUnitaire"),
            // Rent: a single reference only exists while every room is priced
            // alike, which the service reports as a base of 0.
            value:
              loyer && facture.baseUnitaire === 0
                ? t("loyerVariable")
                : formatXAF(facture.baseUnitaire, locale),
          },
          { label: t("encaisse"), value: formatXAF(totalPaye, locale) },
          { label: t("dateLimite"), value: formatDate(facture.dateLimite, locale) },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="mt-1 font-bold text-navy">{value}</div>
          </Card>
        ))}
      </div>

      <TableCard minWidth="min-w-[52rem]">
        <Thead>
          <Th>{t("locataire")}</Th>
          {!loyer && <Th>{t("coefficient")}</Th>}
          <Th align="right">{loyer ? t("loyerAnnuel") : t("montantDu")}</Th>
          {loyer && <Th align="right">{t("payeCeMois")}</Th>}
          <Th align="right">{loyer ? t("payeAnnee", { annee }) : t("montantPaye")}</Th>
          {loyer && <Th align="right">{t("restantAnnee", { annee })}</Th>}
          <Th>{t("datePaiement")}</Th>
          <Th>{t("statut")}</Th>
          <Th align="right" srOnly>
            {tCommon("actions")}
          </Th>
        </Thead>
        <tbody>
          {facture.lignes.map((l) => {
              // Rent only: the annual tracking has no meaning on a monthly charge.
              const suivi = loyer
                ? suiviLoyer({
                    montantAnnuel: l.montantDu,
                    montantPaye: l.montantPaye,
                    paiements: (l.paiements ?? []).map((p) => ({
                      montant: p.montant,
                      date: p.createdAt,
                    })),
                  })
                : null;
              return (
                <Tr key={l.id}>
                  <Td className="font-medium">{l.locataire.fullName}</Td>
                  {!loyer && <Td>{l.coefficient}</Td>}
                  <Td align="right" className="font-mono">
                    {formatXAF(l.montantDu, locale)}
                  </Td>
                  {loyer && (
                    <Td align="right" className="font-mono">
                      {formatXAF(suivi?.payeCeMois ?? 0, locale)}
                    </Td>
                  )}
                  <Td align="right" className="font-mono">
                    {formatXAF(l.montantPaye, locale)}
                  </Td>
                  {loyer && (
                    <Td align="right" className="font-mono font-semibold text-navy">
                      {formatXAF(suivi?.restantAnnee ?? 0, locale)}
                    </Td>
                  )}
                  <Td>{l.datePaiement ? formatDate(l.datePaiement, locale) : "—"}</Td>
                  <Td>
                    <StatutBadge statut={l.statut} />
                  </Td>
                  <Td align="right">
                    {facture!.statutPub === "publiee" && (
                      <button
                        className={linkAction}
                        onClick={() =>
                          download({
                            run: () =>
                              downloadFactureLigne(l.id, `${facture!.type}-${l.locataire.fullName}`),
                            failure: tCommon("downloadFailed"),
                            confirm: {
                              message: t("confirmPrint", { name: l.locataire.fullName }),
                              confirmLabel: tCommon("print"),
                            },
                          })
                        }
                      >
                        {t("facturePdf")}
                      </button>
                    )}
                  </Td>
                </Tr>
              );
            })}
        </tbody>
      </TableCard>
    </>
  );
}
