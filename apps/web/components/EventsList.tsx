"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch } from "@/lib/client/session";
import { formatDate } from "@/lib/format";
import type { EvenementStatut } from "@campusgest/shared";
import { useConfirmAction } from "@/components/Toast";
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
  btnSecondary,
} from "@/components/ui";

const PAGE_SIZE = 20;

interface Evenement {
  id: string;
  titre: string;
  description: string | null;
  dateEvent: string;
  heure: string;
  statut: EvenementStatut;
  creator: { fullName: string };
}

function EventBadge({ statut }: { statut: EvenementStatut }) {
  const t = useTranslations("evenements.status");
  const styles: Record<EvenementStatut, string> = {
    en_attente: "bg-amber-100 text-amber-800",
    approuve: "bg-emerald-100 text-emerald-800",
    rejete: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[statut]}`}>
      {t(statut)}
    </span>
  );
}

/** Event list & proposals; decision (approve/reject) when `admin` (§5.5). */
export function EventsList({ admin }: { admin: boolean }) {
  const t = useTranslations("evenements");
  const apiError = useApiError();
  const confirmAction = useConfirmAction();
  const locale = useLocale();
  const [items, setItems] = useState<Evenement[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [titre, setTitre] = useState("");
  const [dateEvent, setDateEvent] = useState("");
  const [heure, setHeure] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/evenements?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Evenement[]; total: number };
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
      const res = await apiFetch("/api/evenements", {
        method: "POST",
        body: JSON.stringify({ titre, dateEvent, heure, description: description || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("failed")));
        return;
      }
      setTitre("");
      setDateEvent("");
      setHeure("");
      setDescription("");
      if (page === 1) await load();
      else setPage(1);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  function decide(ev: Evenement, statut: "approuve" | "rejete") {
    const approve = statut === "approuve";
    return confirmAction({
      level: approve ? "info" : "danger",
      message: approve
        ? t("confirmApprove", { titre: ev.titre })
        : t("confirmReject", { titre: ev.titre }),
      confirmLabel: approve ? t("approve") : t("reject"),
      success: approve ? t("approved") : t("rejected"),
      failure: t("decisionFailed"),
      run: () =>
        apiFetch(`/api/evenements/${ev.id}/statut`, {
          method: "PATCH",
          body: JSON.stringify({ statut }),
        }),
      // Moved only once the decision is recorded: the badge is what the author
      // will be told, so it must not show a decision the server refused.
      onDone: () => setItems((prev) => prev?.map((x) => (x.id === ev.id ? { ...x, statut } : x)) ?? prev),
    });
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      <Card className="mb-6 max-w-2xl">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-500">{t("hint")}</p>
          <Field label={t("titre")}>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} required minLength={2} maxLength={200} className={inputCls} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field label={t("date")}>
              <input type="date" value={dateEvent} onChange={(e) => setDateEvent(e.target.value)} required className={`${inputCls} w-auto`} />
            </Field>
            <Field label={t("heure")}>
              <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required className={`${inputCls} w-auto`} />
            </Field>
          </div>
          <Field label={t("description")}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} className={inputCls} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("propose")}
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
          {items.map((ev) => (
            <Card key={ev.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-navy">{ev.titre}</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {formatDate(ev.dateEvent, locale)} · {ev.heure} — {t("by", { name: ev.creator.fullName })}
                  </div>
                  {ev.description && <p className="mt-1 text-sm text-slate-600">{ev.description}</p>}
                </div>
                <EventBadge statut={ev.statut} />
              </div>
              {admin && ev.statut === "en_attente" && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => decide(ev, "approuve")} className={`${btnPrimary} px-3 py-1 text-xs`}>
                    {t("approve")}
                  </button>
                  <button onClick={() => decide(ev, "rejete")} className={`${btnSecondary} px-3 py-1 text-xs`}>
                    {t("reject")}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
