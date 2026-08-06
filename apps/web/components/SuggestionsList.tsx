"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatDate } from "@/lib/format";
import { Card, PageTitle, Spinner, EmptyState, Pager, btnSecondary } from "@/components/ui";

const PAGE_SIZE = 20;

interface Suggestion {
  id: string;
  contenu: string;
  ordre: number;
  isReadAdmin: boolean;
  bailleurVisible: boolean;
  readAt: string | null;
  createdAt: string;
  author: { fullName: string };
}

/** Suggestion list. `admin`: read + Bailleur visibility; otherwise read-only (§5.4). */
export function SuggestionsList({ admin }: { admin: boolean }) {
  const t = useTranslations("suggestions");
  const locale = useLocale();
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/suggestions?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Suggestion[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function markRead(id: string) {
    setItems((prev) => prev?.map((s) => (s.id === id ? { ...s, isReadAdmin: true } : s)) ?? prev);
    await apiFetch(`/api/suggestions/${id}/read`, { method: "PATCH" });
  }

  async function toggleVisibility(s: Suggestion) {
    const next = !s.bailleurVisible;
    setItems((prev) => prev?.map((x) => (x.id === s.id ? { ...x, bailleurVisible: next } : x)) ?? prev);
    await apiFetch(`/api/suggestions/${s.id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ bailleurVisible: next }),
    });
  }

  return (
    <>
      <PageTitle>{t("manageTitle")}</PageTitle>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("manageEmpty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id} className={`p-4 ${admin && !s.isReadAdmin ? "border-brand" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold text-slate-400">#{s.ordre}</span>
                <span className="text-xs text-slate-400">{formatDate(s.createdAt, locale)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{s.contenu}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-500">{t("author", { name: s.author.fullName })}</span>
                {admin && (
                  <>
                    {!s.isReadAdmin && (
                      <button onClick={() => markRead(s.id)} className={`${btnSecondary} px-2.5 py-1 text-xs`}>
                        {t("markRead")}
                      </button>
                    )}
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-600">
                      <input
                        type="checkbox"
                        checked={s.bailleurVisible}
                        onChange={() => toggleVisibility(s)}
                      />
                      {t("visibleBailleur")}
                    </label>
                  </>
                )}
                {admin && s.isReadAdmin && <span className="text-emerald-600">{t("statusRead")}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
