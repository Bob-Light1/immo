"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatDate } from "@/lib/format";
import { useConfirmAction } from "@/components/Toast";
import { Card, PageTitle, Spinner, EmptyState, Pager, btnSecondary } from "@/components/ui";

const PAGE_SIZE = 20;

interface Signal {
  id: string;
  sentAt: string;
  latitude: number | null;
  longitude: number | null;
  resolved: boolean;
  sender: { id: string; fullName: string; distressReview: boolean; distressDisabled: boolean };
}

/** Distress signal tracking & arbitration — Admin (§5.8). */
export function DistressAdmin() {
  const t = useTranslations("distress");
  const locale = useLocale();
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Signal[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/distress?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Signal[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function resolve(id: string) {
    return confirmAction({
      message: t("confirmResolve"),
      confirmLabel: t("resolve"),
      success: t("resolveDone"),
      failure: t("resolveFailed"),
      run: () => apiFetch(`/api/distress/${id}/resolve`, { method: "PATCH" }),
      onDone: load,
    });
  }

  /**
   * Banning takes the alert button away from a resident. Whatever the abuse it
   * answers, it is a safety feature being withdrawn — never a one-click move.
   */
  function toggleBan(user: Signal["sender"], disabled: boolean) {
    return confirmAction({
      level: disabled ? "danger" : "info",
      message: disabled
        ? t("confirmBan", { name: user.fullName })
        : t("confirmUnban", { name: user.fullName }),
      confirmLabel: disabled ? t("ban") : t("unban"),
      success: disabled ? t("banDone") : t("unbanDone"),
      failure: t("banFailed"),
      run: () =>
        apiFetch(`/api/users/${user.id}/distress-ban`, {
          method: "PATCH",
          body: JSON.stringify({ disabled }),
        }),
      onDone: load,
    });
  }

  return (
    <>
      <PageTitle>{t("adminTitle")}</PageTitle>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("adminEmpty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id} className={`p-4 ${s.resolved ? "opacity-60" : "border-red-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy">{s.sender.fullName}</span>
                    {s.sender.distressReview && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {t("review")}
                      </span>
                    )}
                    {s.sender.distressDisabled && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {t("banned")}
                      </span>
                    )}
                    {s.resolved && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {t("resolved")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500">{formatDate(s.sentAt, locale)}</div>
                  {s.latitude != null && s.longitude != null && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=18/${s.latitude}/${s.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-navy underline-offset-2 hover:underline"
                    >
                      {t("viewLocation")}
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {!s.resolved && (
                    <button onClick={() => resolve(s.id)} className={`${btnSecondary} px-3 py-1 text-xs`}>
                      {t("resolve")}
                    </button>
                  )}
                  <button
                    onClick={() => toggleBan(s.sender, !s.sender.distressDisabled)}
                    className={`px-3 py-1 text-xs font-semibold ${
                      s.sender.distressDisabled ? "text-emerald-600" : "text-red-600"
                    } hover:underline`}
                  >
                    {s.sender.distressDisabled ? t("unban") : t("ban")}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
