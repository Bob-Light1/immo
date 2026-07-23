"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, downloadRecu, uploadFile } from "@/lib/client/session";
import { formatXAF, formatDate, formatMois } from "@/lib/format";
import type { LigneStatut, PaiementMode } from "@campusgest/shared";
import { PAIEMENT_MODES } from "@campusgest/shared";
import {
  Card,
  StatutBadge,
  PubBadge,
  Spinner,
  ErrorText,
  inputCls,
  btnPrimary,
  btnSecondary,
  btnBrand,
} from "@/components/ui";
import { useConfirm } from "@/components/Toast";

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
  lignes: Ligne[];
}

export default function AdminFactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("factures.detail");
  const tPay = useTranslations("paiement");
  const locale = useLocale();
  const confirm = useConfirm();

  const [facture, setFacture] = useState<FactureDetail | null>(null);
  const [coeffs, setCoeffs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ligne en cours d'encaissement (formulaire inline)
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

  async function action(fn: () => Promise<Response>, failMsg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? failMsg);
        return false;
      }
      await load();
      return true;
    } catch {
      setError(failMsg);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function saveCoefficients() {
    action(
      () =>
        apiFetch(`/api/factures/${id}/coefficients`, {
          method: "POST",
          body: JSON.stringify({
            coefficients: Object.entries(coeffs).map(([locataireId, c]) => ({
              locataireId,
              coefficient: Number(c),
            })),
          }),
        }),
      t("coeffFailed"),
    );
  }

  async function publish() {
    const ok = await confirm({ message: t("confirmPublish"), confirmLabel: t("publish") });
    if (!ok) return;
    action(() => apiFetch(`/api/factures/${id}/publish`, { method: "POST" }), t("publishFailed"));
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
    setBusy(true);
    setError(null);
    let justificatifUrl: string | undefined;
    try {
      if (payJustif) justificatifUrl = await uploadFile(payJustif, "document");
    } catch (err) {
      setError(err instanceof Error ? err.message : tPay("failed"));
      setBusy(false);
      return;
    }
    setBusy(false);
    const ok = await action(
      () =>
        apiFetch("/api/paiements", {
          method: "POST",
          body: JSON.stringify({
            factureLocataireId: paying.id,
            montant: Number(payMontant),
            mode: payMode,
            reference: payRef || undefined,
            justificatifUrl,
          }),
        }),
      tPay("failed"),
    );
    if (ok) setPaying(null);
  }

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
              <th className="px-4 py-3">{t("statut")}</th>
              {!brouillon && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {facture.lignes.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{l.locataire.fullName}</td>
                <td className="px-4 py-3">
                  {brouillon ? (
                    <input
                      type="number"
                      step={0.1}
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
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantDu, locale)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatXAF(l.montantPaye, locale)}</td>
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
                            onClick={() => downloadRecu(p.id)}
                          >
                            {tPay("recu", { montant: formatXAF(p.montant, locale) })}
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
        <ErrorText>{error}</ErrorText>
        {brouillon && (
          <div className="flex gap-3">
            <button className={btnSecondary} onClick={saveCoefficients} disabled={busy}>
              {t("saveCoeffs")}
            </button>
            <button className={btnPrimary} onClick={publish} disabled={busy}>
              {t("publish")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
