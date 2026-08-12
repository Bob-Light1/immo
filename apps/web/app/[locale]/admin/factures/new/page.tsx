"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch } from "@/lib/client/session";
import { moisCourant } from "@/lib/format";
import { FACTURE_TYPES, isLoyer } from "@campusgest/shared";
import { useConfirm } from "@/components/Toast";
import { Card, PageTitle, Field, ErrorText, inputCls, btnPrimary } from "@/components/ui";
import { LocatairesPicker } from "@/components/LocatairesPicker";
import { CompteurSelect } from "@/components/CompteurSelect";

/**
 * Invoice creation (draft). Every active tenant is attached with a coefficient
 * of 1; the coefficients are then adjusted on the detail page, before
 * publication.
 *
 * "Loyer" exception: no split, and no amount to type — each line is filled from
 * the annual tariff of the room its tenant occupies. The field is only the
 * fallback for a tenant whose room carries no tariff yet; every amount stays
 * correctable on the draft, before publication.
 */
export default function NewFacturePage() {
  const t = useTranslations("factures.new");
  const apiError = useApiError();
  const confirm = useConfirm();
  const locale = useLocale();
  const router = useRouter();
  const [type, setType] = useState("Eau");
  // Holds either the total to split or the flat annual amount per tenant,
  // depending on the regime — hence the neutral name.
  const [montant, setMontant] = useState("");
  const [mois, setMois] = useState(moisCourant());
  const [dateLimite, setDateLimite] = useState("");
  // null = every active tenant, the ordinary case; an explicit list covers a
  // charge shared by only part of the residence.
  const [locataireIds, setLocataireIds] = useState<string[] | null>(null);
  // Meter the charge was read on — water and electricity only, and optional
  // even there (a flat-rate bill from the utility measures nothing here).
  const [compteurId, setCompteurId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loyer = isLoyer(type);

  // Rent covers a year, so its deadline has to span that year: pre-fill the end
  // of the covered year rather than let the natural "end of this month" reflex
  // be rejected by the server.
  function onTypeChange(valeur: string) {
    setType(valeur);
    if (isLoyer(valeur)) {
      // Rent is a flat annual amount: no meter reading stands behind it.
      setCompteurId(null);
      if (!dateLimite) setDateLimite(`${mois.slice(0, 4)}-12-31`);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Only one invoice may exist per type and month, so a mistaken creation has
    // to be deleted before the right one can take its place.
    const { ok } = await confirm({ message: t("confirmCreate"), confirmLabel: t("submit") });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const valeur = Number(montant);
      const res = await apiFetch("/api/factures", {
        method: "POST",
        body: JSON.stringify({
          type,
          // Rent: the rooms carry the tariffs, so the amount only travels when
          // the Admin typed one — as the fallback for an unpriced room.
          ...(loyer
            ? montant
              ? { montantParLocataire: valeur }
              : {}
            : { montantTotal: valeur }),
          mois,
          dateLimite,
          ...(locataireIds ? { locataireIds } : {}),
          ...(compteurId ? { compteurId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiError(data, t("failed")));
        return;
      }
      router.replace(`/${locale}/admin/factures/${data.id}`);
    } catch {
      setError(t("failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <Card className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("type")}>
            <input
              className={inputCls}
              list="types-factures"
              value={type}
              onChange={(e) => onTypeChange(e.target.value)}
              required
              minLength={2}
              maxLength={60}
            />
            <datalist id="types-factures">
              {FACTURE_TYPES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label={loyer ? t("loyerRepli") : t("montantTotal")}>
            <input
              className={inputCls}
              type="number"
              min={1}
              step={1}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              // Rent needs no amount: the rooms are priced. Left blank, a tenant
              // without a tariff is reported by name rather than billed at zero.
              required={!loyer}
              placeholder={loyer ? t("loyerRepliPlaceholder") : "60000"}
            />
          </Field>
          <Field label={loyer ? t("moisLoyer") : t("mois")}>
            <input
              className={inputCls}
              type="month"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              required
            />
          </Field>
          <Field label={t("dateLimite")}>
            <input
              className={inputCls}
              type="date"
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
              required
            />
          </Field>
          {!loyer && (
            <Field label={t("compteur")}>
              <CompteurSelect value={compteurId} onChange={setCompteurId} />
            </Field>
          )}
          <Field label={t("locataires")}>
            <LocatairesPicker value={locataireIds} onChange={setLocataireIds} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <p className="text-xs text-slate-500">{loyer ? t("hintLoyer") : t("hint")}</p>
          <button
            type="submit"
            disabled={saving || locataireIds?.length === 0}
            className={btnPrimary}
          >
            {saving ? "…" : t("submit")}
          </button>
        </form>
      </Card>
    </>
  );
}
