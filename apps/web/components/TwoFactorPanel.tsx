"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getSession } from "@/lib/client/session";
import { useConfirmAction, useToast } from "@/components/Toast";
import { Card, Field, ErrorText, inputCls, btnPrimary, btnSecondary } from "@/components/ui";

/** Enables / disables TOTP 2FA (Admin) — design §9. */
export function TwoFactorPanel() {
  const t = useTranslations("twofa");
  const toast = useToast();
  const confirmAction = useConfirmAction();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    apiFetch(`/api/users/${s.user.id}/profile`).then(async (res) => {
      if (res.ok) setEnabled(((await res.json()) as { twoFactorEnabled: boolean }).twoFactorEnabled);
    });
  }, []);

  if (enabled === null) return null;

  async function startSetup() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/2fa/setup", { method: "POST" });
      if (!res.ok) {
        setError(t("setupFailed"));
        return;
      }
      setSetup((await res.json()) as { secret: string; otpauth: string });
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!setup) return;
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ secret: setup.secret, code }),
      });
      if (!res.ok) {
        setError(t("invalidCode"));
        return;
      }
      setEnabled(true);
      setSetup(null);
      setCode("");
      toast.success(t("enabled"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Turning 2FA off leaves the account on its password alone, and the code in
   * the field is enough to do it in one click — hence the confirmation.
   */
  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const done = await confirmAction({
        level: "danger",
        message: t("confirmDisable"),
        confirmLabel: t("disable"),
        success: t("disabled"),
        failure: t("invalidCode"),
        run: () => apiFetch("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
      });
      if (done) {
        setEnabled(false);
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy">{t("title")}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
          {enabled ? t("on") : t("off")}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("desc")}</p>

      {!enabled && !setup && (
        <button onClick={startSetup} disabled={busy} className={`${btnPrimary} mt-4`}>
          {t("enable")}
        </button>
      )}

      {!enabled && setup && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">{t("scanHint")}</p>
          <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs break-all">{setup.secret}</div>
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">otpauth://</summary>
            <span className="break-all">{setup.otpauth}</span>
          </details>
          <Field label={t("enterCode")}>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} className={`${inputCls} w-32`} />
          </Field>
          <div className="flex gap-2">
            <button onClick={verifyCode} disabled={busy || code.length !== 6} className={btnPrimary}>
              {t("confirm")}
            </button>
            <button onClick={() => setSetup(null)} className={btnSecondary}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label={t("enterCode")}>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} className={`${inputCls} w-32`} />
          </Field>
          <button onClick={disable} disabled={busy || code.length !== 6} className={btnSecondary}>
            {t("disable")}
          </button>
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
