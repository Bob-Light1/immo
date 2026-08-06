"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, uploadFile } from "@/lib/client/session";
import { DOCUMENT_CATEGORIES, ROLES, type DocumentCategorie, type Role } from "@campusgest/shared";
import { Card, PageTitle, Field, Spinner, EmptyState, Pager, ErrorText, inputCls, btnPrimary } from "@/components/ui";
import { useToast, useConfirm } from "@/components/Toast";

const PAGE_SIZE = 20;

interface Doc {
  id: string;
  titre: string;
  fichierUrl: string;
  categorie: string;
  visibleRoles: string[];
  uploadeur: string;
  createdAt: string;
}

/**
 * Shared documents (§5.15). The Admin uploads a file (mandatory) and picks the
 * recipient roles; everyone else views / downloads.
 */
export function DocumentsList({ admin }: { admin: boolean }) {
  const t = useTranslations("documents");
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Doc[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [catF, setCatF] = useState("");
  const [titre, setTitre] = useState("");
  const [categorie, setCategorie] = useState<DocumentCategorie>("reglement");
  const [roles, setRoles] = useState<Role[]>([...ROLES]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setItems(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (qDebounced) params.set("q", qDebounced);
    if (catF) params.set("categorie", catF);
    const res = await apiFetch(`/api/documents?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { items: Doc[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, qDebounced, catF]);

  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, catF]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("fichierRequis"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fichierUrl = await uploadFile(file, "document");
      const res = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify({ titre, fichierUrl, categorie, visibleRoles: roles }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error ?? t("failed"));
        return;
      }
      setTitre("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (page === 1) await load();
      else setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({ message: t("confirmDelete"), confirmLabel: t("supprimer"), danger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("deleted"));
      await load();
    } else {
      toast.error(t("failed"));
    }
  }

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>

      {admin && (
        <Card className="mb-6 max-w-2xl">
          <form onSubmit={create} className="space-y-3">
            <Field label={t("titre")}>
              <input value={titre} onChange={(e) => setTitre(e.target.value)} required maxLength={200} className={inputCls} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Field label={t("categorie")}>
                <select value={categorie} onChange={(e) => setCategorie(e.target.value as DocumentCategorie)} className={inputCls}>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cat.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("fichier")}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
              </Field>
            </div>
            <Field label={t("visibleRoles")}>
              <div className="flex flex-wrap gap-3 text-sm">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={roles.includes(r)}
                      onChange={(e) =>
                        setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                      }
                    />
                    {t(`roles.${r}`)}
                  </label>
                ))}
              </div>
            </Field>
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "…" : t("ajouter")}
            </button>
          </form>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${inputCls} w-auto min-w-[14rem] flex-1`}
          aria-label={t("searchPlaceholder")}
        />
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className={`${inputCls} w-auto`} aria-label={t("categorie")}>
          <option value="">{t("filterAllCat")}</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cat.${c}`)}
            </option>
          ))}
        </select>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Card key={d.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {t(`cat.${d.categorie}`)}
                  </span>
                  <a href={d.fichierUrl} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-navy hover:text-brand hover:underline">
                    {d.titre}
                  </a>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {d.uploadeur} · {new Date(d.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <a href={d.fichierUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand hover:underline">
                  {t("ouvrir")}
                </a>
                {admin && (
                  <button onClick={() => remove(d.id)} className="text-sm font-medium text-red-600 hover:underline">
                    {t("supprimer")}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
