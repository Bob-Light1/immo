"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { useConfirm } from "@/components/Toast";
import { DISTRESS_CLICKS_TO_TRIGGER } from "@campusgest/shared";

const WINDOW_MS = 3000;

/**
 * Bouton de détresse (§5.8). Anti-accident : il faut DISTRESS_CLICKS_TO_TRIGGER
 * clics rapides (fenêtre de 3 s) pour déclencher. Propose le partage de position
 * (consentement explicite) avant l'envoi.
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
        { timeout: 5000, enableHighAccuracy: true },
      );
    });
  }

  async function fire() {
    setStatus("sending");
    let body: Record<string, unknown> = { geoConsent: false };
    if (await confirm({ message: t("geoPrompt"), confirmLabel: t("label") })) {
      const pos = await getPosition();
      if (pos) body = { geoConsent: true, ...pos };
    }
    try {
      const res = await apiFetch("/api/distress", { method: "POST", body: JSON.stringify(body) });
      setStatus(res.ok ? "sent" : "error");
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
