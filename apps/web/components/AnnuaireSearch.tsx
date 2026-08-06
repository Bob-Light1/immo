"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getSession } from "@/lib/client/session";
import { Card, PageTitle, Spinner, EmptyState, inputCls, btnSecondary } from "@/components/ui";
import { useConfirm } from "@/components/Toast";

interface Resident {
  userId: string;
  fullName: string;
  role: string;
  photoUrl: string | null;
  bio: string | null;
  competences: string[];
  dispoRecommandation: boolean;
  contact: string | null;
  emailPro: string | null;
}

/** Resident directory: search by skill/degree (§5.14). */
export function AnnuaireSearch() {
  const t = useTranslations("annuaire");
  const tP = useTranslations("portfolio");
  const confirm = useConfirm();
  const [skill, setSkill] = useState("");
  const [dispo, setDispo] = useState(false);
  const [items, setItems] = useState<Resident[] | null>(null);
  // Moderation: the Admin can remove a resident's profile from the directory.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(getSession()?.user.role === "admin");
  }, []);

  async function removePortfolio(r: Resident) {
    const ok = await confirm({
      message: tP("confirmDeleteOther", { name: r.fullName }),
      confirmLabel: tP("delete"),
    });
    if (!ok) return;
    const res = await apiFetch(`/api/portfolios/${r.userId}`, { method: "DELETE" });
    if (res.ok) setItems((list) => (list ?? []).filter((x) => x.userId !== r.userId));
  }

  async function search() {
    setItems(null);
    const params = new URLSearchParams();
    if (skill.trim()) params.set("skill", skill.trim());
    if (dispo) params.set("dispo", "1");
    const res = await apiFetch(`/api/annuaire?${params}`);
    if (res.ok) setItems((await res.json()) as Resident[]);
  }
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder={t("searchPlaceholder")}
          className={`${inputCls} max-w-xs`}
        />
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={dispo} onChange={(e) => setDispo(e.target.checked)} />
          {t("dispoFilter")}
        </label>
        <button onClick={search} className={`${btnSecondary} mb-0.5`}>
          {t("search")}
        </button>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <Card key={r.userId} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full p-2 text-slate-300" aria-hidden="true">
                        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z" />
                      </svg>
                    )}
                  </div>
                  <span className="truncate font-semibold text-navy">{r.fullName}</span>
                </div>
                {r.dispoRecommandation && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {t("available")}
                  </span>
                )}
              </div>
              {r.bio && <p className="mt-1 text-sm text-slate-600">{r.bio}</p>}
              {r.competences.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.competences.map((c, i) => (
                    <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {(r.contact || r.emailPro) && (
                <div className="mt-2 text-xs text-slate-400">{r.emailPro || r.contact}</div>
              )}
              {admin && (
                <button
                  onClick={() => removePortfolio(r)}
                  className="mt-3 text-xs font-medium text-red-600 underline-offset-2 hover:underline"
                >
                  {tP("deleteOther")}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
