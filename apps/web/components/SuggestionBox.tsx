"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch } from "@/lib/client/session";
import { formatDate } from "@/lib/format";
import { Card, PageTitle, Spinner, EmptyState, inputCls, btnPrimary, ErrorText } from "@/components/ui";

interface MySuggestion {
  id: string;
  contenu: string;
  createdAt: string;
  isReadAdmin: boolean;
}

/** The user's suggestion box: submission + tracking (§5.4). */
export function SuggestionBox() {
  const t = useTranslations("suggestions");
  const apiError = useApiError();
  const locale = useLocale();
  const [contenu, setContenu] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MySuggestion[] | null>(null);

  async function load() {
    const res = await apiFetch("/api/suggestions/mine");
    if (res.ok) setMine((await res.json()) as MySuggestion[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/suggestions", {
        method: "POST",
        body: JSON.stringify({ contenu }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("failed")));
        return;
      }
      setContenu("");
      await load();
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <Card className="mb-6 max-w-2xl">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-500">{t("hint")}</p>
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            placeholder={t("placeholder")}
            className={inputCls}
          />
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("submit")}
          </button>
        </form>
      </Card>

      <h2 className="mb-3 font-semibold text-navy">{t("myTitle")}</h2>
      {!mine ? (
        <Spinner />
      ) : mine.length === 0 ? (
        <EmptyState>{t("myEmpty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {mine.map((s) => (
            <Card key={s.id} className="p-4">
              <p className="text-sm text-slate-700">{s.contenu}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">{formatDate(s.createdAt, locale)}</span>
                <span className={s.isReadAdmin ? "text-emerald-600" : "text-slate-400"}>
                  {s.isReadAdmin ? t("statusRead") : t("statusPending")}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
