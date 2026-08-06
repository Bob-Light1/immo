"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, getSession, updateSessionUser } from "@/lib/client/session";
import { LOCALES, type Locale } from "@campusgest/shared";
import { Card, PageTitle, Field, Spinner, ErrorText, inputCls, btnPrimary } from "@/components/ui";

interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  language: string;
  birthday: string | null;
  birthdayPublic: boolean;
  birthdayYearHidden: boolean;
  notifPrefs: { push?: boolean; sms?: boolean; email?: boolean } | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Profile & preferences: birthday opt-in + notification channels (§5.6, §8.3). */
export function ProfileForm() {
  const t = useTranslations("profil");
  const locale = useLocale();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Birthday split apart: day + month (required together); year optional
  // (empty = the user prefers not to reveal their age).
  const [bDay, setBDay] = useState("");
  const [bMonth, setBMonth] = useState("");
  const [bYear, setBYear] = useState("");

  // Localized month names (without relying on translation keys).
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: "long" })),
    [locale],
  );

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    apiFetch(`/api/users/${s.user.id}/profile`).then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as Profile;
      setP(data);
      if (data.birthday) {
        const d = new Date(data.birthday);
        setBDay(String(d.getUTCDate()));
        setBMonth(String(d.getUTCMonth() + 1));
        setBYear(data.birthdayYearHidden ? "" : String(d.getUTCFullYear()));
      }
    });
  }, []);

  if (!p) return <Spinner />;

  const prefs = p.notifPrefs ?? { push: true, sms: false, email: false };
  const setField = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));
  const setPref = (k: "push" | "email", v: boolean) =>
    setP((prev) => (prev ? { ...prev, notifPrefs: { ...prefs, [k]: v } } : prev));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        fullName: p.fullName,
        email: p.email || undefined,
        phone: (p.phone ?? "").trim(),
        language: p.language,
        birthdayPublic: p.birthdayPublic,
        // SMS forced to false: the channel is not available yet.
        notifPrefs: { push: !!prefs.push, sms: false, email: !!prefs.email },
      };
      // Birthday: only stored when both day AND month are provided.
      if (bDay && bMonth) {
        const yearHidden = bYear.trim() === "";
        const year = yearHidden ? 2000 : Number(bYear);
        body.birthday = `${year}-${pad(Number(bMonth))}-${pad(Number(bDay))}`;
        body.birthdayYearHidden = yearHidden;
      }
      const res = await apiFetch(`/api/users/${p.id}/profile`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      const updated = (await res.json()) as Profile;
      setP(updated);
      updateSessionUser({ fullName: updated.fullName, language: updated.language });
      setSaved(true);
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <Card className="max-w-2xl">
        <form onSubmit={save} className="space-y-4">
          <Field label={t("fullName")}>
            <input value={p.fullName} onChange={(e) => setField("fullName", e.target.value)} required className={inputCls} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field label={t("email")}>
              <input type="email" value={p.email ?? ""} onChange={(e) => setField("email", e.target.value)} className={`${inputCls} w-auto`} />
            </Field>
            <Field label={t("phone")}>
              <input
                type="tel"
                value={p.phone ?? ""}
                onChange={(e) => setField("phone", e.target.value)}
                required
                minLength={6}
                maxLength={20}
                className={`${inputCls} w-auto`}
              />
            </Field>
            <Field label={t("language")}>
              <select value={p.language} onChange={(e) => setField("language", e.target.value as Locale)} className={`${inputCls} w-auto`}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy">{t("birthdayTitle")}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t("birthdayDay")}>
                <select value={bDay} onChange={(e) => setBDay(e.target.value)} className={`${inputCls} w-auto`}>
                  <option value="">—</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("birthdayMonth")}>
                <select value={bMonth} onChange={(e) => setBMonth(e.target.value)} className={`${inputCls} w-auto`}>
                  <option value="">—</option>
                  {months.map((name, i) => (
                    <option key={i} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("birthdayYear")}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear()}
                  placeholder="—"
                  value={bYear}
                  onChange={(e) => setBYear(e.target.value)}
                  className={`${inputCls} w-28`}
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={p.birthdayPublic} onChange={(e) => setField("birthdayPublic", e.target.checked)} />
                {t("birthdayPublic")}
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("birthdayYearOptional")}</p>
            <p className="mt-0.5 text-xs text-slate-400">{t("birthdayHint")}</p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-navy">{t("notifTitle")}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!prefs.push} onChange={(e) => setPref("push", e.target.checked)} />
                {t("notif.push")}
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!prefs.email} onChange={(e) => setPref("email", e.target.checked)} />
                {t("notif.email")}
              </label>
              {/* SMS: shown but disabled — channel unavailable for now. */}
              <label className="flex cursor-not-allowed items-center gap-2 text-slate-400" title={t("smsUnavailable")}>
                <input type="checkbox" checked={false} disabled />
                {t("notif.sms")}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{t("smsUnavailable")}</span>
              </label>
            </div>
          </div>

          <ErrorText>{error}</ErrorText>
          {saved && <p className="text-sm font-medium text-emerald-600">{t("saved")}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("save")}
          </button>
        </form>
      </Card>
    </>
  );
}
