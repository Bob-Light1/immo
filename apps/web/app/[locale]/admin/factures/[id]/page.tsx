"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, downloadFactureLigne, downloadRecu, uploadFile } from "@/lib/client/session";
import { formatXAF, formatDate, formatPeriodeFacture } from "@/lib/format";
import type { CompteurType, LigneStatut, PaiementMode } from "@campusgest/shared";
import { PAIEMENT_MODES, isLoyer, suiviLoyer } from "@campusgest/shared";
import {
  Card,
  StatutBadge,
  PubBadge,
  Spinner,
  inputCls,
  btnPrimary,
  btnSecondary,
  btnBrand,
} from "@/components/ui";
import { useConfirmAction, useDownload, type ConfirmActionOptions } from "@/components/Toast";
import { LocatairesPicker } from "@/components/LocatairesPicker";
import { CompteurSelect } from "@/components/CompteurSelect";

interface Paiement {
  id: string;
  montant: number;
  mode: PaiementMode;
  reference: string | null;
  justificatifUrl: string | null;
  createdAt: string;
}

interface Ligne {
  id: string;
  locataireId: string;
  coefficient: number;
  montantDu: number;
  montantPaye: number;
  statut: LigneStatut;
  locataire: { id: string; fullName: string };
  paiements: Paiement[];
}

interface FactureDetail {
  id: string;
  type: string;
  montantTotal: number;
  sommeCoeff: number;
  baseUnitaire: number;
  mois: string;
  dateLimite: string;
  statutPub: "brouillon" | "publiee";
  compteur: { id: string; type: CompteurType; libelle: string } | null;
  lignes: Ligne[];
}

export default function AdminFactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("factures.detail");
  const tCommon = useTranslations("common");
  const tPay = useTranslations("paiement");
  const locale = useLocale();
  const confirmAction = useConfirmAction();
  const download = useDownload();

  const router = useRouter();
  const [facture, setFacture] = useState<FactureDetail | null>(null);
  const [coeffs, setCoeffs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Draft correction form (closed by default)
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState("");
  const [editMontant, setEditMontant] = useState("");
  const [editMois, setEditMois] = useState("");
  const [editDateLimite, setEditDateLimite] = useState("");
  // Roster of the draft: stated explicitly here, since correcting it is the
  // point (a tenant who arrived after the draft was written, typically on a
  // rolled-over one).
  const [editLocataires, setEditLocataires] = useState<string[]>([]);
  // `null` detaches the meter, which is what the empty option sends.
  const [editCompteurId, setEditCompteurId] = useState<string | null>(null);
  // Line currently being settled (inline form)
  const [paying, setPaying] = useState<Ligne | null>(null);
  const [payMontant, setPayMontant] = useState("");
  const [payMode, setPayMode] = useState<PaiementMode>("especes");
  const [payRef, setPayRef] = useState("");
  const [payJustif, setPayJustif] = useState<File | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/factures/${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as FactureDetail;
    setFacture(data);
    setCoeffs(Object.fromEntries(data.lignes.map((l) => [l.locataireId, String(l.coefficient)])));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!facture) return <Spinner />;

  const brouillon = facture.statutPub === "brouillon";
  // Rent: flat annual amount per tenant — no coefficient, no split; what is
  // tracked instead is how far the year's payments have progressed.
  const loyer = isLoyer(facture.type);
  const annee = facture.mois.slice(0, 4);

  /**
   * Every write on this screen is guarded: the amounts here are what the
   * tenants owe, and once the invoice is published they are financial history.
   * The dialog reports the outcome itself, so nothing on the page has to.
   */
  async function guarded(options: ConfirmActionOptions) {
    setBusy(true);
    try {
      return await confirmAction({ onDone: load, ...options });
    } finally {
      setBusy(false);
    }
  }

  function saveCoefficients() {
    return guarded({
      message: t("confirmCoeffs"),
      confirmLabel: t("saveCoeffs"),
      success: t("coeffsSaved"),
      failure: t("coeffFailed"),
      run: () =>
        apiFetch(`/api/factures/${id}/coefficients`, {
          method: "POST",
          body: JSON.stringify({
            coefficients: Object.entries(coeffs).map(([locataireId, c]) => ({
              locataireId,
              coefficient: Number(c),
            })),
          }),
        }),
    });
  }

  function publish() {
    return guarded({
      level: "danger",
      message: t("confirmPublish"),
      confirmLabel: t("publish"),
      success: t("published"),
      failure: t("publishFailed"),
      run: () => apiFetch(`/api/factures/${id}/publish`, { method: "POST" }),
    });
  }

  function openEdit() {
    if (!facture) return;
    setEditType(facture.type);
    // For rent the editable figure is the flat annual amount, which the invoice
    // carries as its base unit, not the total.
    setEditMontant(String(loyer ? facture.baseUnitaire : facture.montantTotal));
    setEditMois(facture.mois);
    setEditDateLimite(facture.dateLimite.slice(0, 10));
    setEditLocataires(facture.lignes.map((l) => l.locataireId));
    setEditCompteurId(facture.compteur?.id ?? null);
    setEditing(true);
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    const montant = Number(editMontant);
    const ok = await guarded({
      message: t("confirmEdit"),
      confirmLabel: t("save"),
      success: t("edited"),
      failure: t("editFailed"),
      run: () =>
        apiFetch(`/api/factures/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            type: editType,
            ...(isLoyer(editType)
              ? { montantParLocataire: montant }
              : { montantTotal: montant }),
            mois: editMois,
            dateLimite: editDateLimite,
            locataireIds: editLocataires,
            // Rent measures nothing: switching a draft over to it drops the meter.
            compteurId: isLoyer(editType) ? null : editCompteurId,
          }),
        }),
    });
    if (ok) setEditing(false);
  }

  /**
   * Deleting a draft takes its lines and their coefficients with it, so the
   * month has to be retyped: the button sits next to the ones used daily.
   */
  function remove() {
    if (!facture) return;
    return guarded({
      level: "critical",
      message: t("confirmDelete"),
      challenge: { phrase: facture.mois, hint: t("deleteHint", { mois: facture.mois }) },
      confirmLabel: t("delete"),
      success: t("deleted"),
      failure: t("deleteFailed"),
      run: () => apiFetch(`/api/factures/${id}`, { method: "DELETE" }),
      // Nothing left to reload: the invoice this screen shows is gone.
      onDone: () => router.replace(`/${locale}/admin/factures`),
    });
  }

  /**
   * A payment is never edited, only cancelled with a reason, and the reason is
   * what the audit log will keep — so it is collected in the dialog itself.
   */
  function cancelPaiement(p: Paiement) {
    return guarded({
      level: "danger",
      message: tPay("confirmAnnulation", { montant: formatXAF(p.montant, locale) }),
      confirmLabel: tPay("annulerPaiement"),
      prompt: {
        label: tPay("motif"),
        placeholder: tPay("motifPlaceholder"),
        minLength: 5,
        tooShort: tPay("motifTropCourt"),
      },
      success: tPay("annulationDone"),
      failure: tPay("annulationFailed"),
      run: (motif) =>
        apiFetch(`/api/paiements/${p.id}`, {
          method: "DELETE",
          body: JSON.stringify({ motif }),
        }),
    });
  }

  /**
   * Editing someone else's document is confirmed: a PDF leaving this screen
   * carries a tenant's name and what they owe.
   */
  function printFactureLigne(l: Ligne) {
    return download({
      run: () => downloadFactureLigne(l.id, `${facture!.type}-${l.locataire.fullName}`),
      failure: tCommon("downloadFailed"),
      confirm: {
        message: t("confirmPrint", { name: l.locataire.fullName }),
        confirmLabel: tCommon("print"),
      },
    });
  }

  function printRecu(p: Paiement) {
    return download({
      run: () => downloadRecu(p.id),
      failure: tCommon("downloadFailed"),
      confirm: {
        message: tPay("confirmPrintRecu", { montant: formatXAF(p.montant, locale) }),
        confirmLabel: tCommon("print"),
      },
    });
  }

  function openPay(l: Ligne) {
    setPaying(l);
    setPayMontant(String(l.montantDu - l.montantPaye));
    setPayMode("especes");
    setPayRef("");
    setPayJustif(null);
  }

  async function submitPay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    const ligne = paying;
    const ok = await guarded({
      level: "danger",
      message: tPay("confirmEncaisser", { montant: formatXAF(Number(payMontant), locale) }),
      confirmLabel: tPay("valider"),
      success: tPay("encaisse"),
      failure: tPay("failed"),
      // The receipt is uploaded inside the guarded run, so a cancelled dialog
      // leaves nothing behind in the object store.
      run: async () => {
        const justificatifUrl = payJustif ? (await uploadFile(payJustif, "document")).url : undefined;
        return apiFetch("/api/paiements", {
          method: "POST",
          body: JSON.stringify({
            factureLocataireId: ligne.id,
            montant: Number(payMontant),
            mode: payMode,
            reference: payRef || undefined,
            justificatifUrl,
          }),
        });
      },
    });
    if (ok) setPaying(null);
  }

  const totalPaye = facture.lignes.reduce((s, l) => s + l.montantPaye, 0);

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
            value: formatXAF(facture.baseUnitaire, locale),
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">{t("locataire")}</th>
              {!loyer && <th className="px-4 py-3">{t("coefficient")}</th>}
              <th className="px-4 py-3 text-right">{loyer ? t("loyerAnnuel") : t("montantDu")}</th>
              {loyer && <th className="px-4 py-3 text-right">{t("payeCeMois")}</th>}
              <th className="px-4 py-3 text-right">
                {loyer ? t("payeAnnee", { annee }) : t("montantPaye")}
              </th>
              {loyer && <th className="px-4 py-3 text-right">{t("restantAnnee", { annee })}</th>}
              <th className="px-4 py-3">{t("statut")}</th>
              {!brouillon && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {facture.lignes.map((l) => {
              // Rent only: the annual tracking has no meaning on a monthly charge.
              const suivi = loyer
                ? suiviLoyer({
                    montantAnnuel: l.montantDu,
                    montantPaye: l.montantPaye,
                    paiements: l.paiements.map((p) => ({ montant: p.montant, date: p.createdAt })),
                  })
                : null;
              return (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{l.locataire.fullName}</td>
                {!loyer && (
                  <td className="px-4 py-3">
                    {brouillon ? (
                      <input
                        type="number"
                        step={0.01}
                        min={0.1}
                        max={99.99}
                        value={coeffs[l.locataireId] ?? ""}
                        onChange={(e) =>
                          setCoeffs((c) => ({ ...c, [l.locataireId]: e.target.value }))
                        }
                        className={`${inputCls} w-24`}
                      />
                    ) : (
                      l.coefficient
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantDu, locale)}</td>
                {loyer && (
                  <td className="px-4 py-3 text-right font-mono">
                    {formatXAF(suivi?.payeCeMois ?? 0, locale)}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantPaye, locale)}</td>
                {loyer && (
                  <td className="px-4 py-3 text-right font-mono font-semibold text-navy">
                    {formatXAF(suivi?.restantAnnee ?? 0, locale)}
                  </td>
                )}
                <td className="px-4 py-3">
                  <StatutBadge statut={l.statut} />
                </td>
                {!brouillon && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1.5">
                      {l.statut !== "paye" && (
                        <button
                          className={`${btnBrand} px-3 py-1 text-xs`}
                          onClick={() => openPay(l)}
                          disabled={busy}
                        >
                          {tPay("encaisser")}
                        </button>
                      )}
                      <button
                        className="text-xs text-navy underline-offset-2 hover:underline"
                        onClick={() => printFactureLigne(l)}
                      >
                        {t("facturePdf")}
                      </button>
                      {l.paiements.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          {p.justificatifUrl && (
                            <a
                              href={p.justificatifUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand underline-offset-2 hover:underline"
                            >
                              {tPay("voirJustificatif")}
                            </a>
                          )}
                          <button
                            className="text-xs text-navy underline-offset-2 hover:underline"
                            onClick={() => printRecu(p)}
                          >
                            {tPay("recu", { montant: formatXAF(p.montant, locale) })}
                          </button>
                          <button
                            className="text-xs text-red-600 underline-offset-2 hover:underline"
                            onClick={() => cancelPaiement(p)}
                            disabled={busy}
                          >
                            {tPay("annulerPaiement")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editing && (
        <Card className="mt-6 max-w-lg border-brand">
          <h2 className="mb-1 font-semibold text-navy">{t("editTitle")}</h2>
          <p className="mb-4 text-xs text-slate-500">{t("editHint")}</p>
          <form onSubmit={submitEdit} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("type")}</label>
              <input
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                required
                minLength={2}
                maxLength={60}
                className={`${inputCls} w-40`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {isLoyer(editType) ? t("montantAnnuelLocataire") : t("montantTotal")}
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={editMontant}
                onChange={(e) => setEditMontant(e.target.value)}
                required
                className={`${inputCls} w-40`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("mois")}</label>
              <input
                type="month"
                value={editMois}
                onChange={(e) => setEditMois(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("dateLimite")}
              </label>
              <input
                type="date"
                value={editDateLimite}
                onChange={(e) => setEditDateLimite(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            {!isLoyer(editType) && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("compteur")}
                </label>
                <CompteurSelect
                  value={editCompteurId}
                  onChange={setEditCompteurId}
                  className="w-48"
                />
              </div>
            )}
            <div className="w-full">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("locataires")}
              </label>
              <LocatairesPicker
                value={editLocataires}
                onChange={(ids) => setEditLocataires(ids ?? [])}
                autoriseTous={false}
              />
            </div>
            <button
              type="submit"
              disabled={busy || editLocataires.length === 0}
              className={btnPrimary}
            >
              {busy ? "…" : t("save")}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </form>
        </Card>
      )}

      {paying && (
        <Card className="mt-6 max-w-lg border-brand">
          <h2 className="mb-4 font-semibold text-navy">
            {tPay("titre", { name: paying.locataire.fullName })}
          </h2>
          <form onSubmit={submitPay} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {tPay("montant")}
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={payMontant}
                onChange={(e) => setPayMontant(e.target.value)}
                required
                className={`${inputCls} w-36`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{tPay("mode")}</label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as PaiementMode)}
                className={inputCls}
              >
                {PAIEMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {tPay(`modes.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {tPay("reference")}
              </label>
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className={`${inputCls} w-40`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {tPay("justificatif")}
              </label>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setPayJustif(e.target.files?.[0] ?? null)}
                className="block text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1.5 file:text-xs file:font-medium"
              />
            </div>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "…" : tPay("valider")}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setPaying(null)}>
              {tPay("annuler")}
            </button>
          </form>
        </Card>
      )}

      <div className="mt-6 space-y-3">
        {brouillon && (
          <div className="flex flex-wrap items-center gap-3">
            {loyer ? (
              <p className="text-sm text-slate-500">{t("loyerNoCoeff")}</p>
            ) : (
              <button className={btnSecondary} onClick={saveCoefficients} disabled={busy}>
                {t("saveCoeffs")}
              </button>
            )}
            <button className={btnSecondary} onClick={openEdit} disabled={busy}>
              {t("edit")}
            </button>
            <button className={btnPrimary} onClick={publish} disabled={busy}>
              {t("publish")}
            </button>
            <button
              className="text-sm text-red-600 underline-offset-2 hover:underline"
              onClick={remove}
              disabled={busy}
            >
              {t("delete")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
