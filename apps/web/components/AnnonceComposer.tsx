"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch } from "@/lib/client/session";
import { ANNONCE_SCOPES, type AnnonceScope } from "@campusgest/shared";
import { useConfirm } from "@/components/Toast";
import { Card, PageTitle, Field, inputCls, btnPrimary, ErrorText } from "@/components/ui";

/** Composer for an announcement to all (or one role) — Admin & Bailleur (§5.3). */
export function AnnonceComposer() {
  const t = useTranslations("annonces");
  const apiError = useApiError();
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<AnnonceScope>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // A push reaches every recipient's phone the moment it is sent and cannot
    // be recalled, so the last chance to reread the wording is here.
    const { ok } = await confirm({
      level: "danger",
      message: t("confirmSend"),
      confirmLabel: t("send"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSentCount(null);
    try {
      const res = await apiFetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify({ title, body, scope }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("failed")));
        return;
      }
      const d = (await res.json()) as { sent: number };
      setSentCount(d.sent);
      setTitle("");
      setBody("");
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
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("titleField")}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={200}
              className={inputCls}
            />
          </Field>
          <Field label={t("bodyField")}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={2}
              maxLength={2000}
              rows={4}
              className={inputCls}
            />
          </Field>
          <Field label={t("scope")}>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AnnonceScope)}
              className={inputCls}
            >
              {ANNONCE_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`scopes.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <ErrorText>{error}</ErrorText>
          {sentCount !== null && (
            <p className="text-sm font-medium text-emerald-600">{t("sent", { n: sentCount })}</p>
          )}
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("send")}
          </button>
        </form>
      </Card>
    </>
  );
}
