"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF, formatMois } from "@/lib/format";
import { Card, PageTitle, Field, Spinner, EmptyState, Pager, ErrorText, inputCls, btnPrimary } from "@/components/ui";

const PAGE_SIZE = 20;

interface Prediction {
  id: string;
  mois: string;
  type: string;
  montantCalcule: number;
  montantReel: number | null;
}

const empty = { mois: "", type: "", indiceDiff: "", prixUnit: "", tva: "", locCompteur: "", transport: "" };

/** Estimations de charge par type : création (Admin) + comparaison estimé/réel (§5.11). */
export function PredictionsList({ admin }: { admin: boolean }) {
  const t = useTranslations("predictions");
  const locale = useLocale();
  const [items, setItems] = useState<Prediction[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ ...empty });
  const [reels, setReels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/predictions?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Prediction[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const num = (v: string) => (v ? Number(v) : undefined);
      const res = await apiFetch("/api/predictions", {
        method: "POST",
        body: JSON.stringify({
          mois: form.mois,
          type: form.type,
          indiceDiff: num(form.indiceDiff),
          prixUnit: num(form.prixUnit),
          tva: num(form.tva),
          locCompteur: num(form.locCompteur),
          transport: num(form.transport),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      setForm({ ...empty });
      if (page === 1) await load();
      else setPage(1);
    } finally {
      setBusy(false);
    }
  }

  async function saveReel(id: string) {
    const montantReel = Number(reels[id]);
    if (!Number.isFinite(montantReel) || montantReel < 0) return;
    const res = await apiFetch(`/api/predictions/${id}/reel`, {
      method: "PATCH",
      body: JSON.stringify({ montantReel }),
    });
    if (res.ok) {
      setReels((r) => ({ ...r, [id]: "" }));
      await load();
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      {admin && (
        <Card className="mb-6 max-w-2xl">
          <form onSubmit={create} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Field label={t("type")}>
                <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required minLength={2} placeholder="Électricité" className={`${inputCls} w-auto`} />
              </Field>
              <Field label={t("mois")}>
                <input type="month" value={form.mois} onChange={(e) => setForm({ ...form, mois: e.target.value })} required className={`${inputCls} w-auto`} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([["indiceDiff", "I"], ["prixUnit", "P"], ["tva", "TVA"], ["locCompteur", "LC"], ["transport", "T"]] as const).map(([k, lbl]) => (
                <Field key={k} label={t(`params.${k}`)}>
                  <input type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-label={lbl} className={inputCls} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-slate-400">{t("formula")}</p>
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "…" : t("create")}
            </button>
          </form>
        </Card>
      )}

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("mois")}</th>
                <th className="px-4 py-3 text-right">{t("estime")}</th>
                <th className="px-4 py-3 text-right">{t("reel")}</th>
                <th className="px-4 py-3 text-right">{t("ecart")}</th>
                {admin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const ecart = p.montantReel != null ? p.montantReel - p.montantCalcule : null;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">{p.type}</td>
                    <td className="px-4 py-3">{formatMois(p.mois, locale)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatXAF(p.montantCalcule, locale)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.montantReel != null ? formatXAF(p.montantReel, locale) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {ecart != null ? (
                        <span className={ecart > 0 ? "text-red-600" : ecart < 0 ? "text-emerald-600" : "text-slate-500"}>
                          {ecart > 0 ? "+" : ""}
                          {formatXAF(ecart, locale)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {admin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={reels[p.id] ?? ""}
                            onChange={(e) => setReels((r) => ({ ...r, [p.id]: e.target.value }))}
                            placeholder={t("reel")}
                            className={`${inputCls} w-28`}
                          />
                          <button onClick={() => saveReel(p.id)} className="text-xs text-navy hover:underline">
                            {t("saveReel")}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
