"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatDate } from "@/lib/format";
import { TICKET_CATEGORIES, TICKET_STATUTS, type TicketCategorie, type TicketStatut } from "@campusgest/shared";
import {
  Card,
  PageTitle,
  Field,
  Spinner,
  EmptyState,
  Pager,
  ErrorText,
  inputCls,
  btnPrimary,
} from "@/components/ui";

const PAGE_SIZE = 20;

interface Ticket {
  id: string;
  categorie: TicketCategorie;
  description: string;
  statut: TicketStatut;
  priorite: number;
  createdAt: string;
  author: { fullName: string };
  assignedTo: { fullName: string } | null;
}

function StatutBadge({ statut }: { statut: TicketStatut }) {
  const t = useTranslations("maintenance.status");
  const styles: Record<TicketStatut, string> = {
    ouvert: "bg-slate-100 text-slate-700",
    en_cours: "bg-amber-100 text-amber-800",
    resolu: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[statut]}`}>
      {t(statut)}
    </span>
  );
}

/** Maintenance tickets: creation + list; status change when `admin` (§5.12). */
export function TicketsList({ admin }: { admin: boolean }) {
  const t = useTranslations("maintenance");
  const locale = useLocale();
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [categorie, setCategorie] = useState<TicketCategorie>("plomberie");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/tickets?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Ticket[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ categorie, description }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      setDescription("");
      if (page === 1) await load();
      else setPage(1);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatut(id: string, statut: TicketStatut) {
    setItems((prev) => prev?.map((x) => (x.id === id ? { ...x, statut } : x)) ?? prev);
    await apiFetch(`/api/tickets/${id}/statut`, { method: "PATCH", body: JSON.stringify({ statut }) });
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      <Card className="mb-6 max-w-2xl">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-500">{t("hint")}</p>
          <div className="flex flex-wrap gap-3">
            <Field label={t("categorie")}>
              <select value={categorie} onChange={(e) => setCategorie(e.target.value as TicketCategorie)} className={`${inputCls} w-auto`}>
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("description")}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={3} maxLength={2000} rows={3} className={inputCls} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("submit")}
          </button>
        </form>
      </Card>

      <h2 className="mb-3 font-semibold text-navy">{t("listTitle")}</h2>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((tk) => (
            <Card key={tk.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-navy">{t(`categories.${tk.categorie}`)}</span>
                    <StatutBadge statut={tk.statut} />
                    {tk.priorite > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {t("priority", { n: tk.priorite })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{tk.description}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    {t("by", { name: tk.author.fullName })} · {formatDate(tk.createdAt, locale)}
                  </div>
                </div>
                {admin && (
                  <select
                    value={tk.statut}
                    onChange={(e) => changeStatut(tk.id, e.target.value as TicketStatut)}
                    className={`${inputCls} w-auto text-sm`}
                  >
                    {TICKET_STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
