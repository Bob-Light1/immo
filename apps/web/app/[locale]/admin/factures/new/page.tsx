"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { moisCourant } from "@/lib/format";
import { FACTURE_TYPES, isLoyer } from "@campusgest/shared";
import { Card, PageTitle, Field, ErrorText, inputCls, btnPrimary } from "@/components/ui";

/**
 * Invoice creation (draft). Every active tenant is attached with a coefficient
 * of 1; the coefficients are then adjusted on the detail page, before
 * publication.
 *
 * "Loyer" exception: no split. The Admin enters the annual amount owed by each
 * tenant, carried as-is onto every line.
 */
export default function NewFacturePage() {
  const t = useTranslations("factures.new");
  const locale = useLocale();
  const router = useRouter();
  const [type, setType] = useState("Eau");
  const [montantTotal, setMontantTotal] = useState("");
  const [mois, setMois] = useState(moisCourant());
  const [dateLimite, setDateLimite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loyer = isLoyer(type);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const montant = Number(montantTotal);
      const res = await apiFetch("/api/factures", {
        method: "POST",
        body: JSON.stringify({
          type,
          ...(loyer ? { montantParLocataire: montant } : { montantTotal: montant }),
          mois,
          dateLimite,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("failed"));
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
              onChange={(e) => setType(e.target.value)}
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
          <Field label={loyer ? t("montantAnnuelLocataire") : t("montantTotal")}>
            <input
              className={inputCls}
              type="number"
              min={1}
              step={1}
              value={montantTotal}
              onChange={(e) => setMontantTotal(e.target.value)}
              required
              placeholder={loyer ? "240000" : "60000"}
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
          <ErrorText>{error}</ErrorText>
          <p className="text-xs text-slate-500">{loyer ? t("hintLoyer") : t("hint")}</p>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "…" : t("submit")}
          </button>
        </form>
      </Card>
    </>
  );
}
