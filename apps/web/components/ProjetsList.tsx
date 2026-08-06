"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF } from "@/lib/format";
import { ROLES, type Role } from "@campusgest/shared";
import { Card, PageTitle, Field, Spinner, EmptyState, Pager, ErrorText, inputCls, btnPrimary, btnBrand } from "@/components/ui";

const PAGE_SIZE = 20;

interface Projet {
  id: string;
  titre: string;
  description: string;
  objectifs: string[];
  vision: string | null;
  besoinsFinanciers: number | null;
  montantContribution: number | null;
  collecte: number;
  nbContributions: number;
}

/** Shared projects: publication (Admin) + pot + contribution (§5.10). */
export function ProjetsList({ admin }: { admin: boolean }) {
  const t = useTranslations("projets");
  const locale = useLocale();
  const [items, setItems] = useState<Projet[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ titre: "", description: "", vision: "", besoins: "", contribution: "" });
  const [roles, setRoles] = useState<Role[]>([...ROLES]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contribInputs, setContribInputs] = useState<Record<string, string>>({});

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/projets?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Projet[]; total: number };
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
      const res = await apiFetch("/api/projets", {
        method: "POST",
        body: JSON.stringify({
          titre: form.titre,
          description: form.description,
          vision: form.vision || undefined,
          besoinsFinanciers: form.besoins ? Number(form.besoins) : undefined,
          montantContribution: form.contribution ? Number(form.contribution) : undefined,
          visibleRoles: roles,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      setForm({ titre: "", description: "", vision: "", besoins: "", contribution: "" });
      if (page === 1) await load();
      else setPage(1);
    } finally {
      setBusy(false);
    }
  }

  async function contribuer(id: string) {
    const montant = Number(contribInputs[id]);
    if (!montant || montant <= 0) return;
    const res = await apiFetch(`/api/projets/${id}/contribuer`, {
      method: "POST",
      body: JSON.stringify({ montant }),
    });
    if (res.ok) {
      setContribInputs((c) => ({ ...c, [id]: "" }));
      await load();
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      {admin && (
        <Card className="mb-6 max-w-2xl">
          <form onSubmit={create} className="space-y-3">
            <Field label={t("titre")}>
              <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} required minLength={2} className={inputCls} />
            </Field>
            <Field label={t("description")}>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={2} className={inputCls} />
            </Field>
            <Field label={t("vision")}>
              <input value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} className={inputCls} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label={t("besoins")}>
                <input type="number" min={0} value={form.besoins} onChange={(e) => setForm({ ...form, besoins: e.target.value })} className={`${inputCls} w-40`} />
              </Field>
              <Field label={t("contribution")}>
                <input type="number" min={0} value={form.contribution} onChange={(e) => setForm({ ...form, contribution: e.target.value })} className={`${inputCls} w-40`} />
              </Field>
            </div>
            <Field label={t("visibleRoles")}>
              <div className="flex flex-wrap gap-3 text-sm">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={roles.includes(r)}
                      onChange={(e) =>
                        setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                      }
                    />
                    {t(`roles.${r}`)}
                  </label>
                ))}
              </div>
            </Field>
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
        <div className="space-y-4">
          {items.map((p) => {
            const pct = p.besoinsFinanciers ? Math.min(100, Math.round((p.collecte / p.besoinsFinanciers) * 100)) : 0;
            return (
              <Card key={p.id} className="p-4">
                <h3 className="font-semibold text-navy">{p.titre}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                {p.vision && <p className="mt-1 text-xs italic text-slate-400">{p.vision}</p>}
                {p.objectifs.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                    {p.objectifs.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                )}
                {p.besoinsFinanciers != null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{t("collecte", { v: formatXAF(p.collecte, locale) })}</span>
                      <span>{t("objectif", { v: formatXAF(p.besoinsFinanciers, locale) })}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-0.5 text-right text-xs text-slate-400">{t("nbContrib", { n: p.nbContributions })}</div>
                  </div>
                )}
                <div className="mt-3 flex items-end gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder={p.montantContribution ? String(p.montantContribution) : t("amount")}
                    value={contribInputs[p.id] ?? ""}
                    onChange={(e) => setContribInputs((c) => ({ ...c, [p.id]: e.target.value }))}
                    className={`${inputCls} w-36`}
                  />
                  <button onClick={() => contribuer(p.id)} className={`${btnBrand} px-3 py-2 text-sm`}>
                    {t("contribuer")}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
