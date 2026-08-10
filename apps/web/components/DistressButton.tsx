"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { useConfirm } from "@/components/Toast";
import { DISTRESS_CLICKS_TO_TRIGGER } from "@campusgest/shared";

const WINDOW_MS = 3000;

/**
 * Distress button (§5.8). Accident guard: DISTRESS_CLICKS_TO_TRIGGER rapid
 * clicks (3 s window) are required to fire. Offers position sharing (explicit
 * consent) before sending.
 */
export function DistressButton() {
  const t = useTranslations("distress");
  const confirm = useConfirm();
  const clicks = useRef<number[]>([]);
  const [remaining, setRemaining] = useState(DISTRESS_CLICKS_TO_TRIGGER);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function getPosition(): Promise<{ latitude: number; longitude: number } | null> {
    if (!("geolocation" in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, enableHighAccuracy: true },
      );
    });
  }

  /**
   * Reads the position and attaches it to the signal already sent. Kept off the
   * alert path: neither the browser's permission prompt nor the GPS read
   * (several seconds) can delay or prevent the emission.
   */
  async function attachPosition(signalId: string) {
    const pos = await getPosition();
    if (!pos) return;
    await apiFetch(`/api/distress/${signalId}/position`, {
      method: "PATCH",
      body: JSON.stringify(pos),
    }).catch(() => {});
  }

  async function fire() {
    setStatus("sending");
    try {
      // The signal goes out first, always, unconditionally.
      const res = await apiFetch("/api/distress", {
        method: "POST",
        body: JSON.stringify({ geoConsent: false }),
      });
      setStatus(res.ok ? "sent" : "error");

      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        // Geolocation consent is requested afterwards, alert already broadcast.
        void confirm({ message: t("geoPrompt"), confirmLabel: t("label") }).then(({ ok }) => {
          if (ok) void attachPosition(id);
        });
      }
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 5000);
  }

  function onClick() {
    if (status === "sending") return;
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t0) => now - t0 < WINDOW_MS), now];
    const left = Math.max(0, DISTRESS_CLICKS_TO_TRIGGER - clicks.current.length);
    setRemaining(left);
    if (clicks.current.length >= DISTRESS_CLICKS_TO_TRIGGER) {
      clicks.current = [];
      setRemaining(DISTRESS_CLICKS_TO_TRIGGER);
      void fire();
    }
  }

  const partial = remaining < DISTRESS_CLICKS_TO_TRIGGER && remaining > 0;
  return (
    <div className="relative">
      <button
        onClick={onClick}
        title={t("hint", { n: DISTRESS_CLICKS_TO_TRIGGER })}
        aria-label={t("label")}
        className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition ${
          status === "sent"
            ? "bg-emerald-100 text-emerald-700"
            : "text-red-600 hover:bg-red-50"
        }`}
      >
        {status === "sending" ? "…" : status === "sent" ? t("sent") : "🚨"}
        {partial && <span className="ml-1 text-xs text-slate-400">{remaining}</span>}
      </button>
      {status === "error" && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-red-600">
          {t("error")}
        </span>
      )}
    </div>
  );
}
