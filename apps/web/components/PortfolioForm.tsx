"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch, deleteUpload, uploadFile } from "@/lib/client/session";
import { Card, Field, Spinner, ErrorText, inputCls, btnPrimary } from "@/components/ui";
import { useConfirm } from "@/components/Toast";
import { StoredImage } from "@/components/StoredImage";

interface Portfolio {
  bio: string | null;
  photoUrl: string | null;
  competences: string[] | null;
  diplomes: string[] | null;
  realisations: string[] | null;
  contact: string | null;
  emailPro: string | null;
  dispoRecommandation: boolean;
}

const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const fromTags = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Editing my professional portfolio (§5.7). */
export function PortfolioForm() {
  const t = useTranslations("portfolio");
  const apiError = useApiError();
  const confirm = useConfirm();
  const [loaded, setLoaded] = useState(false);
  // A portfolio only exists after a first save: removal is therefore offered
  // only in that case.
  const [exists, setExists] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Key of a photo uploaded but not yet saved: nothing references it until the
  // portfolio is written, so it is this form's job to collect it.
  const pendingKey = useRef<string | null>(null);
  const [bio, setBio] = useState("");
  const [competences, setCompetences] = useState("");
  const [diplomes, setDiplomes] = useState("");
  const [realisations, setRealisations] = useState("");
  const [contact, setContact] = useState("");
  const [emailPro, setEmailPro] = useState("");
  const [dispo, setDispo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    apiFetch("/api/portfolios").then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { portfolio: Portfolio | null };
        const p = data.portfolio;
        if (p) {
          setExists(true);
          setPhotoUrl(p.photoUrl ?? "");
          setBio(p.bio ?? "");
          setCompetences((p.competences ?? []).join(", "));
          setDiplomes((p.diplomes ?? []).join("\n"));
          setRealisations((p.realisations ?? []).join("\n"));
          setContact(p.contact ?? "");
          setEmailPro(p.emailPro ?? "");
          setDispo(p.dispoRecommandation);
        }
      }
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <Spinner />;

  async function onPickPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url, key } = await uploadFile(file, "image");
      // Picking twice before saving leaves the first image referenced by
      // nothing; drop it rather than let every hesitation cost an object.
      if (pendingKey.current) await deleteUpload(pendingKey.current);
      pendingKey.current = key;
      setPhotoUrl(url);
    } catch (err) {
      setError(apiError(err, t("failed")));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/api/portfolios", {
        method: "PUT",
        body: JSON.stringify({
          photoUrl: photoUrl || "",
          bio: bio || undefined,
          competences: fromTags(competences),
          diplomes: fromLines(diplomes),
          realisations: fromLines(realisations),
          contact: contact || undefined,
          emailPro: emailPro || "",
          dispoRecommandation: dispo,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("failed")));
        return;
      }
      pendingKey.current = null;
      setSaved(true);
      setExists(true);
    } finally {
      setBusy(false);
    }
  }

  /** Removes my profile from the directory (the account stays intact). */
  async function remove() {
    const { ok } = await confirm({
      level: "danger",
      message: t("confirmDelete"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/api/portfolios", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("deleteFailed")));
        return;
      }
      setExists(false);
      setPhotoUrl("");
      setBio("");
      setCompetences("");
      setDiplomes("");
      setRealisations("");
      setContact("");
      setEmailPro("");
      setDispo(false);
      setDeleted(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <h2 className="mb-4 font-semibold text-navy">{t("myTitle")}</h2>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <StoredImage
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
              fallback={
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full p-4 text-slate-300" aria-hidden="true">
                  <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z" />
                </svg>
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("photo")}</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickPhoto(f);
                }}
                className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              {uploading && <span className="text-xs text-slate-400">…</span>}
              {photoUrl && !uploading && (
                <button type="button" onClick={() => setPhotoUrl("")} className="text-xs font-medium text-red-600 hover:underline">
                  {t("photoRemove")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("photoHint")}</p>
          </div>
        </div>
        <Field label={t("bio")}>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={2000} className={inputCls} />
        </Field>
        <Field label={t("competences")}>
          <input value={competences} onChange={(e) => setCompetences(e.target.value)} placeholder={t("competencesHint")} className={inputCls} />
        </Field>
        <Field label={t("diplomes")}>
          <textarea value={diplomes} onChange={(e) => setDiplomes(e.target.value)} rows={2} placeholder={t("oneLine")} className={inputCls} />
        </Field>
        <Field label={t("realisations")}>
          <textarea value={realisations} onChange={(e) => setRealisations(e.target.value)} rows={2} placeholder={t("oneLine")} className={inputCls} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Field label={t("contact")}>
            <input value={contact} onChange={(e) => setContact(e.target.value)} className={`${inputCls} w-auto`} />
          </Field>
          <Field label={t("emailPro")}>
            <input type="email" value={emailPro} onChange={(e) => setEmailPro(e.target.value)} className={`${inputCls} w-auto`} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={dispo} onChange={(e) => setDispo(e.target.checked)} />
          {t("dispo")}
        </label>
        <ErrorText>{error}</ErrorText>
        {saved && <p className="text-sm font-medium text-emerald-600">{t("saved")}</p>}
        {deleted && <p className="text-sm font-medium text-slate-600">{t("deleted")}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "…" : t("save")}
          </button>
          {exists && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-sm font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {t("delete")}
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
