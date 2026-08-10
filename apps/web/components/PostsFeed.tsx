"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch, uploadFile } from "@/lib/client/session";
import { useConfirmAction } from "@/components/Toast";
import { Card, PageTitle, Field, Spinner, EmptyState, Pager, ErrorText, inputCls, btnPrimary } from "@/components/ui";

const PAGE_SIZE = 20;

interface Post {
  id: string;
  titre: string;
  description: string;
  imageUrl: string;
  isHidden: boolean;
  auteur: string;
  createdAt: string;
}

/**
 * News feed (§5.9). The Admin / the Bailleur publish a post with a mandatory
 * image (uploaded to the object storage); the Admin can hide a post.
 */
export function PostsFeed({ canPublish, admin }: { canPublish: boolean; admin: boolean }) {
  const t = useTranslations("posts");
  const apiError = useApiError();
  const confirmAction = useConfirmAction();
  const [items, setItems] = useState<Post[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setItems(null);
    const res = await apiFetch(`/api/posts?page=${page}&limit=${PAGE_SIZE}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Post[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("imageRequise"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const imageUrl = await uploadFile(file, "image");
      const res = await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({ titre, description, imageUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(apiError(d, t("failed")));
        return;
      }
      setTitre("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (page === 1) await load();
      else setPage(1);
    } catch (err) {
      setError(apiError(err, t("failed")));
    } finally {
      setBusy(false);
    }
  }

  function toggleHidden(p: Post) {
    const hide = !p.isHidden;
    return confirmAction({
      level: hide ? "danger" : "info",
      message: hide ? t("confirmHide", { titre: p.titre }) : t("confirmShow", { titre: p.titre }),
      confirmLabel: hide ? t("masquer") : t("afficher"),
      success: hide ? t("hiddenDone") : t("shownDone"),
      failure: t("moderationFailed"),
      run: () =>
        apiFetch(`/api/posts/${p.id}/hidden`, {
          method: "PATCH",
          body: JSON.stringify({ isHidden: hide }),
        }),
      onDone: load,
    });
  }

  // Local search over the loaded page (title + description).
  const ql = q.trim().toLowerCase();
  const visibleItems = !items
    ? []
    : ql
      ? items.filter((p) => `${p.titre} ${p.description}`.toLowerCase().includes(ql))
      : items;

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      {canPublish && (
        <Card className="mb-6 max-w-2xl">
          <form onSubmit={create} className="space-y-3">
            <Field label={t("titre")}>
              <input value={titre} onChange={(e) => setTitre(e.target.value)} required maxLength={100} className={inputCls} />
            </Field>
            <Field label={t("description")}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={300} rows={2} className={inputCls} />
            </Field>
            <Field label={t("image")}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <p className="mt-1 text-xs text-slate-400">{t("imageHint")}</p>
            </Field>
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "…" : t("publier")}
            </button>
          </form>
        </Card>
      )}

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${inputCls} w-full`}
          aria-label={t("searchPlaceholder")}
        />
      </div>

      {!items ? (
        <Spinner />
      ) : visibleItems.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((p) => (
            <Card key={p.id} className={`overflow-hidden p-0 ${p.isHidden ? "opacity-60" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.titre} className="max-h-80 w-full object-cover" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-navy">{p.titre}</h3>
                  {p.isHidden && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {t("masque")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {p.auteur} · {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  {admin && (
                    <button onClick={() => toggleHidden(p)} className="text-xs font-medium text-brand hover:underline">
                      {p.isHidden ? t("afficher") : t("masquer")}
                    </button>
                  )}
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
