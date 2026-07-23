"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, getSession, setSession, updateSessionUser } from "@/lib/client/session";
import { MIN_PASSWORD_LENGTH } from "@campusgest/shared";
import { Card, Field, ErrorText, inputCls, btnPrimary } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

/**
 * Changement d'identifiants. Obligatoire à la première connexion
 * (useAuth y redirige tant que first_login est vrai), accessible ensuite
 * depuis le profil.
 */
export default function ChangeCredentialsPage() {
  const t = useTranslations("credentials");
  const locale = useLocale();
  const router = useRouter();
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace(`/${locale}/login`);
      return;
    }
    setNewUsername(s.user.username);
  }, [locale, router]);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const canSubmit = newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("tooShort"));
      return;
    }
    if (newPassword !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = getSession();
      const res = await apiFetch("/api/auth/change-credentials", {
        method: "POST",
        body: JSON.stringify({
          newUsername: newUsername && newUsername !== s?.user.username ? newUsername : undefined,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("failed"));
        return;
      }
      // Le serveur réémet un access token (tokenVersion incrémenté).
      const current = getSession();
      if (current && data.accessToken) {
        setSession({
          token: data.accessToken,
          user: { ...current.user, firstLogin: false, username: data.username },
        });
      } else {
        updateSessionUser({ firstLogin: false, username: data.username });
      }
      router.replace(`/${locale}/${getSession()?.user.role ?? "locataire"}`);
    } catch {
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-bold text-navy">{t("title")}</h1>
        <p className="mb-6 text-sm text-slate-500">{t("subtitle")}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("newUsername")}>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              minLength={3}
              maxLength={50}
              autoComplete="username"
              className={inputCls}
            />
          </Field>
          <Field label={t("currentPassword")}>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </Field>
          <Field label={t("newPassword")}>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputCls}
            />
            <p className={`mt-1 text-xs ${tooShort ? "text-red-600" : "text-slate-400"}`}>{t("rules")}</p>
          </Field>
          <Field label={t("confirmPassword")}>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputCls}
            />
            {mismatch && <p className="mt-1 text-xs text-red-600">{t("mismatch")}</p>}
          </Field>
          <ErrorText>{error}</ErrorText>
          <button type="submit" disabled={loading || !canSubmit} className={`${btnPrimary} w-full`}>
            {loading ? "…" : t("submit")}
          </button>
        </form>
      </Card>
    </main>
  );
}
