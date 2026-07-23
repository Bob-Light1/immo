"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { Card, PageTitle, Field, Spinner, EmptyState, Pager, ErrorText, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

const PAGE_SIZE = 20;

interface Sondage {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  isOpen: boolean;
  myVote: number | null;
}

/** Sondages : création (Admin) + vote + résultats temps réel + clôture (§5.13). */
export function SondagesList({ admin }: { admin: boolean }) {
  const t = useTranslations("sondages");
  const [items, setItems] = useState<Sondage[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/sondages?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Sondage[]; total: number };
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
    const options = optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      setError(t("needOptions"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/sondages", { method: "POST", body: JSON.stringify({ question, options }) });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      setQuestion("");
      setOptionsText("");
      if (page === 1) await load();
      else setPage(1);
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string, choix: number) {
    setItems((prev) =>
      prev?.map((s) => {
        if (s.id !== id || !s.isOpen) return s;
        const counts = [...s.counts];
        let totalVotes = s.totalVotes;
        if (s.myVote != null) counts[s.myVote] = Math.max(0, counts[s.myVote]! - 1);
        else totalVotes += 1;
        counts[choix] = (counts[choix] ?? 0) + 1;
        return { ...s, counts, totalVotes, myVote: choix };
      }) ?? prev,
    );
    await apiFetch(`/api/sondages/${id}/vote`, { method: "POST", body: JSON.stringify({ choix }) });
  }

  async function close(id: string) {
    setItems((prev) => prev?.map((s) => (s.id === id ? { ...s, isOpen: false } : s)) ?? prev);
    await apiFetch(`/api/sondages/${id}/close`, { method: "PATCH" });
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      {admin && (
        <Card className="mb-6 max-w-2xl">
          <form onSubmit={create} className="space-y-3">
            <Field label={t("question")}>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} required minLength={3} maxLength={300} className={inputCls} />
            </Field>
            <Field label={t("options")}>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} placeholder={t("optionsHint")} className={inputCls} />
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
          {items.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-navy">{s.question}</h3>
                {!s.isOpen && (
                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {t("closed")}
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {s.options.map((opt, i) => {
                  const pct = s.totalVotes > 0 ? Math.round(((s.counts[i] ?? 0) / s.totalVotes) * 100) : 0;
                  const mine = s.myVote === i;
                  return (
                    <button
                      key={i}
                      onClick={() => s.isOpen && vote(s.id, i)}
                      disabled={!s.isOpen}
                      className={`block w-full overflow-hidden rounded-lg border text-left ${
                        mine ? "border-brand" : "border-slate-200"
                      } ${s.isOpen ? "hover:border-brand" : "cursor-default"}`}
                    >
                      <div className="relative px-3 py-2">
                        <div className="absolute inset-y-0 left-0 bg-brand/10" style={{ width: `${pct}%` }} />
                        <div className="relative flex justify-between text-sm">
                          <span className={mine ? "font-semibold text-navy" : "text-slate-700"}>
                            {mine ? "✓ " : ""}{opt}
                          </span>
                          <span className="font-mono text-slate-500">{pct}% ({s.counts[i] ?? 0})</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{t("totalVotes", { n: s.totalVotes })}</span>
                {admin && s.isOpen && (
                  <button onClick={() => close(s.id)} className={`${btnSecondary} px-2.5 py-1 text-xs`}>
                    {t("close")}
                  </button>
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
