"use client";

import { useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setSession, type SessionUser } from "@/lib/client/session";
import { LOCALES, type Locale } from "@campusgest/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/Brand";
import { PasswordInput } from "@/components/PasswordInput";

export default function LoginPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totp: totp || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.twoFactorRequired) {
          setNeed2fa(true);
          if (totp) setError(t("invalid"));
          return;
        }
        setError(t("invalid"));
        return;
      }
      const data = (await res.json()) as { accessToken: string; user: SessionUser };
      setSession({ token: data.accessToken, user: data.user });
      // Sign-in is the one moment the account preference is known, so it wins
      // over the prefix the visitor happened to land on: a resident reaching
      // the default /fr from a shared link still lands in their own language.
      const cible = LOCALES.includes(data.user.language as Locale) ? data.user.language : locale;
      if (data.user.firstLogin) {
        router.replace(`/${cible}/change-credentials`);
      } else {
        router.replace(`/${cible}/${data.user.role}`);
      }
    } catch {
      setError(t("invalid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="cg-screen flex items-center justify-center p-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("username")}</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("password")}</label>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
          {need2fa && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("totp")}</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-1 focus:ring-navy"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white transition hover:bg-navy-dark disabled:opacity-60"
          >
            {loading ? "…" : t("submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
