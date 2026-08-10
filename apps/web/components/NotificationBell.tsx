"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { pushSupported, pushPermission, pushSubscribed, enablePush, disablePush } from "@/lib/client/push";
import { formatDate } from "@/lib/format";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Notification bell: initial load + real-time stream (SSE).
 * The badge shows the unread count; a click opens the panel and marks as read.
 */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPerm(pushPermission());
    void pushSubscribed().then(setSubscribed);
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        const r = await enablePush();
        setSubscribed(r.ok);
      }
      setPerm(pushPermission());
    } finally {
      setPushBusy(false);
    }
  }

  // Re-subscribing on a locale change is what makes a language switch reach the
  // inbox: the server re-renders keyed notifications, so the panel is already
  // translated by the time the user opens it.
  useEffect(() => {
    let mounted = true;
    setItems([]);
    apiFetch(`/api/notifications?limit=15&locale=${locale}`).then(async (res) => {
      if (!res.ok || !mounted) return;
      const data = (await res.json()) as { items: Notif[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    });

    // Live stream: the EventSource carries the refresh cookie (same-origin).
    const es = new EventSource(`/api/notifications/stream?locale=${locale}`);
    es.addEventListener("notification", (e) => {
      const n = JSON.parse((e as MessageEvent).data) as Notif;
      setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 30)));
    });
    es.addEventListener("unread", (e) => {
      setUnread(JSON.parse((e as MessageEvent).data).unread);
    });

    return () => {
      mounted = false;
      es.close();
    };
  }, [locale]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Read markers stay optimistic and unconfirmed — a dialog per notification
  // would be unusable — but a refused one is put back rather than left showing
  // an inbox emptier than it is.
  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    const res = await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (!res.ok) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      setUnread((u) => u + 1);
    }
  }

  async function markAll() {
    const previous = items;
    const previousUnread = unread;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    const res = await apiFetch("/api/notifications/read-all", { method: "POST" });
    if (!res.ok) {
      setItems(previous);
      setUnread(previousUnread);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
        aria-label={t("title")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-navy">{t("title")}</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand hover:underline">
                {t("markAll")}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">{t("empty")}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markRead(n.id)}
                  className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${
                    n.isRead ? "" : "bg-brand/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-navy">{n.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{n.body}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {formatDate(n.createdAt, locale)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {pushSupported() && perm !== "denied" && (
            <div className="border-t border-slate-100 px-4 py-2.5 text-center">
              <button
                onClick={togglePush}
                disabled={pushBusy}
                className="text-xs text-brand hover:underline disabled:opacity-60"
              >
                {pushBusy ? "…" : subscribed ? t("pushOff") : t("pushOn")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
