"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch } from "@/lib/client/session";
import { formatXAF } from "@/lib/format";
import { nomChambre } from "@/components/ChambreSelect";
import {
  Card,
  PageTitle,
  Field,
  Spinner,
  EmptyState,
  ErrorText,
  TableCard,
  Thead,
  Th,
  Tr,
  Td,
  RowActions,
  linkAction,
  linkDanger,
  inputCls,
  btnPrimary,
} from "@/components/ui";
import { useConfirmAction, useToast } from "@/components/Toast";
import { CompteurSelect } from "@/components/CompteurSelect";

interface Chambre {
  id: string;
  bloc: string;
  numero: string;
  capacite: number;
  loyerAnnuel: number;
  isActive: boolean;
  compteurElec: { id: string; libelle: string } | null;
  occupants: { id: string; fullName: string }[];
}

/** Row being edited. The rent is the field that actually moves, year to year. */
interface Draft {
  bloc: string;
  numero: string;
  capacite: string;
  loyerAnnuel: string;
  compteurElecId: string | null;
}

const emptyForm = { bloc: "", numero: "", capacite: "1", loyerAnnuel: "", compteurElecId: null as string | null };

/**
 * Rooms (§3), and above all their annual rent.
 *
 * The tariff of a room is what its occupants are billed: a rent invoice reads
 * it to fill each tenant's line. Restating it here — which is what happens at
 * the turn of the year, as rents follow inflation — is therefore the routine
 * act of this page. It changes nothing already published: an invoice froze the
 * amount it was raised on, and that is what the tenants owe.
 */
export default function AdminChambresPage() {
  const t = useTranslations("chambres");
  const tCommon = useTranslations("common");
  const apiError = useApiError();
  const locale = useLocale();
  const toast = useToast();
  const confirmAction = useConfirmAction();

  const [items, setItems] = useState<Chambre[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/chambres");
    if (!res.ok) return;
    const data = (await res.json()) as { items: Chambre[] };
    setItems(data.items);
    setDrafts(
      Object.fromEntries(
        data.items.map((c) => [
          c.id,
          {
            bloc: c.bloc,
            numero: c.numero,
            capacite: String(c.capacite),
            loyerAnnuel: String(c.loyerAnnuel),
            compteurElecId: c.compteurElec?.id ?? null,
          },
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
        apiFetch("/api/chambres", {
          method: "POST",
          body: JSON.stringify({
            bloc: form.bloc,
            numero: form.numero,
            capacite: Number(form.capacite),
            loyerAnnuel: form.loyerAnnuel ? Number(form.loyerAnnuel) : 0,
            compteurElecId: form.compteurElecId,
          }),
        }),
      t("createFailed"),
    );
    if (ok) {
      setForm({ ...emptyForm });
      toast.success(t("created"));
    }
  }

  /**
   * Saving a room is guarded rather than silent: the rent it carries is what
   * the next invoice bills, so the dialog states how many residents it moves.
   */
  function save(c: Chambre) {
    const draft = drafts[c.id];
    if (!draft) return;
    const montant = Number(draft.loyerAnnuel);
    const change = montant !== c.loyerAnnuel && c.occupants.length > 0;
    return confirmAction({
      message: change
        ? t("confirmLoyer", {
            chambre: nomChambre(c),
            montant: formatXAF(montant, locale),
            count: c.occupants.length,
          })
        : t("confirmSave", { chambre: nomChambre(c) }),
      confirmLabel: t("save"),
      success: t("saved"),
      failure: t("saveFailed"),
      run: () =>
        apiFetch(`/api/chambres/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            bloc: draft.bloc,
            numero: draft.numero,
            capacite: Number(draft.capacite),
            loyerAnnuel: montant,
            compteurElecId: draft.compteurElecId,
          }),
        }),
      onDone: load,
    });
  }

  /** Retires a room from the lists (or brings it back) without deleting it. */
  function toggleActive(c: Chambre) {
    return confirmAction({
      level: c.isActive ? "danger" : "info",
      message: c.isActive
        ? t("confirmRetirer", { chambre: nomChambre(c) })
        : t("confirmReactiver", { chambre: nomChambre(c) }),
      confirmLabel: c.isActive ? t("retirer") : t("reactiver"),
      success: c.isActive ? t("retiree") : t("reactivee"),
      failure: t("saveFailed"),
      run: () =>
        apiFetch(`/api/chambres/${c.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: !c.isActive }),
        }),
      onDone: load,
    });
  }

  function remove(c: Chambre) {
    return confirmAction({
      level: "danger",
      message: t("confirmDelete", { chambre: nomChambre(c) }),
      confirmLabel: t("delete"),
      success: t("deleted"),
      failure: t("deleteFailed"),
      run: () => apiFetch(`/api/chambres/${c.id}`, { method: "DELETE" }),
      onDone: load,
    });
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      <Card className="mb-6 border-l-4 border-l-brand bg-brand/5 p-4">
        <p className="text-sm text-slate-600">{t("purpose")}</p>
      </Card>

      <Card className="mb-6 max-w-3xl">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field label={t("bloc")}>
            <input
              value={form.bloc}
              onChange={(e) => setForm({ ...form, bloc: e.target.value })}
              required
              maxLength={20}
              placeholder={t("blocPlaceholder")}
              className={`${inputCls} w-28`}
            />
          </Field>
          <Field label={t("numero")}>
            <input
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
              required
              maxLength={20}
              placeholder={t("numeroPlaceholder")}
              className={`${inputCls} w-28`}
            />
          </Field>
          <Field label={t("loyerAnnuel")}>
            <input
              type="number"
              min={0}
              step={1}
              value={form.loyerAnnuel}
              onChange={(e) => setForm({ ...form, loyerAnnuel: e.target.value })}
              placeholder="240000"
              className={`${inputCls} w-36`}
            />
          </Field>
          <Field label={t("capacite")}>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={form.capacite}
              onChange={(e) => setForm({ ...form, capacite: e.target.value })}
              required
              className={`${inputCls} w-24`}
            />
          </Field>
          <Field label={t("compteurElec")}>
            <CompteurSelect
              value={form.compteurElecId}
              onChange={(id) => setForm({ ...form, compteurElecId: id })}
              filterType="electricite"
              className="w-44"
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
        <TableCard className="mt-3" minWidth="min-w-[64rem]">
          <Thead>
            <Th>{t("chambre")}</Th>
            <Th align="right">{t("loyerAnnuel")}</Th>
            <Th>{t("capacite")}</Th>
            <Th>{t("occupants")}</Th>
            <Th>{t("compteurElec")}</Th>
            <Th align="right" srOnly>
              {tCommon("actions")}
            </Th>
          </Thead>
          <tbody>
            {items.map((c) => {
              const draft = drafts[c.id];
              return (
                <Tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                  <Td>
                    <div className="flex gap-1.5">
                      <input
                        value={draft?.bloc ?? ""}
                        onChange={(e) => patchDraft(c.id, { bloc: e.target.value })}
                        maxLength={20}
                        aria-label={t("bloc")}
                        className={`${inputCls} w-20`}
                      />
                      <input
                        value={draft?.numero ?? ""}
                        onChange={(e) => patchDraft(c.id, { numero: e.target.value })}
                        maxLength={20}
                        aria-label={t("numero")}
                        className={`${inputCls} w-20`}
                      />
                    </div>
                    {!c.isActive && (
                      <span className="mt-1 block text-xs text-slate-500">{t("retiree")}</span>
                    )}
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft?.loyerAnnuel ?? ""}
                      onChange={(e) => patchDraft(c.id, { loyerAnnuel: e.target.value })}
                      aria-label={t("loyerDe", { chambre: nomChambre(c) })}
                      className={`${inputCls} w-36 text-right font-mono`}
                    />
                    {c.loyerAnnuel === 0 && (
                      <span className="mt-1 block text-xs text-amber-700">{t("sansTarif")}</span>
                    )}
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={draft?.capacite ?? ""}
                      onChange={(e) => patchDraft(c.id, { capacite: e.target.value })}
                      aria-label={t("capacite")}
                      className={`${inputCls} w-20`}
                    />
                  </Td>
                  <Td wrap className="max-w-[16rem] text-xs text-slate-600">
                    {c.occupants.length === 0
                      ? t("aucunOccupant")
                      : c.occupants.map((o) => o.fullName).join(", ")}
                    <span className="mt-1 block text-slate-400">
                      {t("places", { occupants: c.occupants.length, capacite: c.capacite })}
                    </span>
                  </Td>
                  <Td>
                    <CompteurSelect
                      value={draft?.compteurElecId ?? null}
                      onChange={(id) => patchDraft(c.id, { compteurElecId: id })}
                      filterType="electricite"
                      className="w-40"
                    />
                  </Td>
                  <Td align="right">
                    <RowActions>
                      <button onClick={() => save(c)} disabled={busy} className={linkAction}>
                        {t("save")}
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        disabled={busy}
                        className={linkAction}
                      >
                        {c.isActive ? t("retirer") : t("reactiver")}
                      </button>
                      <button
                        onClick={() => remove(c)}
                        disabled={busy || c.occupants.length > 0}
                        title={c.occupants.length > 0 ? t("deleteBloque") : undefined}
                        className={`${linkDanger} disabled:text-slate-300 disabled:no-underline`}
                      >
                        {t("delete")}
                      </button>
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
