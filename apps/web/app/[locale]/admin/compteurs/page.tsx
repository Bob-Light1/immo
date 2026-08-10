"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { COMPTEUR_SCOPES, COMPTEUR_TYPES } from "@campusgest/shared";
import type { CompteurScope, CompteurType } from "@campusgest/shared";
import { apiFetch } from "@/lib/client/session";
import {
  Card,
  PageTitle,
  Field,
  Spinner,
  EmptyState,
  ErrorText,
  inputCls,
  btnPrimary,
} from "@/components/ui";
import { useConfirmAction, useToast } from "@/components/Toast";

interface Compteur {
  id: string;
  type: CompteurType;
  libelle: string;
  scope: CompteurScope;
  dernierIndex: number;
  _count: { factures: number; chambres: number };
}

/** Row being edited: label, scope and the reading, all three correctable. */
interface Draft {
  libelle: string;
  scope: CompteurScope;
  dernierIndex: string;
}

const emptyForm = {
  type: "eau" as CompteurType,
  libelle: "",
  scope: "cite" as CompteurScope,
  dernierIndex: "",
};

/**
 * Meters (§3). They are what water and electricity invoices are raised against,
 * and the reading kept here is what the next consumption is measured from — so
 * recording a new one is the routine act of this page, not creating meters.
 */
export default function AdminCompteursPage() {
  const t = useTranslations("compteurs");
  const apiError = useApiError();
  const locale = useLocale();
  const toast = useToast();
  const confirmAction = useConfirmAction();

  const [items, setItems] = useState<Compteur[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/compteurs");
    if (!res.ok) return;
    const data = (await res.json()) as { items: Compteur[] };
    setItems(data.items);
    setDrafts(
      Object.fromEntries(
        data.items.map((c) => [
          c.id,
          { libelle: c.libelle, scope: c.scope, dernierIndex: String(c.dernierIndex) },
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<Response>, failMsg: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(apiError(data, failMsg));
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

  async function create(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        apiFetch("/api/compteurs", {
          method: "POST",
          body: JSON.stringify({
            type: form.type,
            libelle: form.libelle,
            scope: form.scope,
            dernierIndex: form.dernierIndex ? Number(form.dernierIndex) : 0,
          }),
        }),
      t("createFailed"),
    );
    if (ok) {
      setForm({ ...emptyForm });
      toast.success(t("created"));
    }
  }

  async function save(c: Compteur) {
    const draft = drafts[c.id];
    if (!draft) return;
    const ok = await run(
      () =>
        apiFetch(`/api/compteurs/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            libelle: draft.libelle,
            scope: draft.scope,
            dernierIndex: Number(draft.dernierIndex),
          }),
        }),
      t("saveFailed"),
    );
    if (ok) toast.success(t("saved"));
  }

  function remove(c: Compteur) {
    return confirmAction({
      level: "danger",
      message: t("confirmDelete", { libelle: c.libelle }),
      confirmLabel: t("delete"),
      success: t("deleted"),
      failure: t("deleteFailed"),
      run: () => apiFetch(`/api/compteurs/${c.id}`, { method: "DELETE" }),
      onDone: load,
    });
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      <Card className="mb-6 border-l-4 border-l-brand bg-brand/5 p-4">
        <p className="text-sm text-slate-600">{t("purpose")}</p>
      </Card>

      <Card className="mb-6 max-w-2xl">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field label={t("type")}>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CompteurType })}
              className={inputCls}
            >
              {COMPTEUR_TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`types.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("libelle")}>
            <input
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              required
              minLength={2}
              maxLength={60}
              placeholder={t("libellePlaceholder")}
              className={`${inputCls} w-48`}
            />
          </Field>
          <Field label={t("scope")}>
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value as CompteurScope })}
              className={inputCls}
            >
              {COMPTEUR_SCOPES.map((v) => (
                <option key={v} value={v}>
                  {t(`scopes.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("indexInitial")}>
            <input
              type="number"
              min={0}
              step={1}
              value={form.dernierIndex}
              onChange={(e) => setForm({ ...form, dernierIndex: e.target.value })}
              className={`${inputCls} w-32`}
            />
          </Field>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("create")}
          </button>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Card className="mt-3 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">{t("libelle")}</th>
                <th className="px-4 py-3">{t("type")}</th>
                <th className="px-4 py-3">{t("scope")}</th>
                <th className="px-4 py-3">{t("dernierIndex")}</th>
                <th className="px-4 py-3">{t("usage")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const draft = drafts[c.id];
                // Consumption the new reading would record: shown before saving,
                // since that difference is the figure an estimate is built on.
                const saisi = Number(draft?.dernierIndex);
                const delta = Number.isFinite(saisi) ? saisi - c.dernierIndex : 0;
                const utilise = c._count.factures > 0 || c._count.chambres > 0;
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        value={draft?.libelle ?? ""}
                        onChange={(e) => patchDraft(c.id, { libelle: e.target.value })}
                        minLength={2}
                        maxLength={60}
                        className={`${inputCls} w-44`}
                      />
                    </td>
                    <td className="px-4 py-3">{t(`types.${c.type}`)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={draft?.scope ?? c.scope}
                        onChange={(e) => patchDraft(c.id, { scope: e.target.value as CompteurScope })}
                        className={inputCls}
                      >
                        {COMPTEUR_SCOPES.map((v) => (
                          <option key={v} value={v}>
                            {t(`scopes.${v}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft?.dernierIndex ?? ""}
                        onChange={(e) => patchDraft(c.id, { dernierIndex: e.target.value })}
                        className={`${inputCls} w-32 font-mono`}
                      />
                      {delta !== 0 && (
                        <span className="mt-1 block text-xs text-slate-500">
                          {t("consommation", {
                            delta: `${delta > 0 ? "+" : ""}${delta.toLocaleString(locale)}`,
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {t("usageDetail", {
                        factures: c._count.factures,
                        chambres: c._count.chambres,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => save(c)}
                          disabled={busy}
                          className="text-xs text-navy underline-offset-2 hover:underline"
                        >
                          {t("save")}
                        </button>
                        <button
                          onClick={() => remove(c)}
                          disabled={busy || utilise}
                          title={utilise ? t("deleteBloque") : undefined}
                          className="text-xs text-red-600 underline-offset-2 hover:underline disabled:text-slate-300 disabled:no-underline"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
