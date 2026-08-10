"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useApiError } from "@/lib/client/api-error";
import { apiFetch, getSession, updateSessionUser } from "@/lib/client/session";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@campusgest/shared";
import {
  Card,
  PageTitle,
  Field,
  ErrorText,
  Spinner,
  EmptyState,
  Pager,
  inputCls,
  btnPrimary,
  btnSecondary,
} from "@/components/ui";
import { useToast, useConfirmAction } from "@/components/Toast";

const PAGE_SIZE = 20;

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: "admin" | "bailleur" | "locataire";
  email: string | null;
  phone: string | null;
  language: string;
  isActive: boolean;
  firstLogin: boolean;
}

interface Created {
  user: { username: string; fullName: string };
  tempPassword: string;
}

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const apiError = useApiError();
  const tRole = useTranslations("nav.role");
  const tLang = useTranslations("language");
  const toast = useToast();
  const confirmAction = useConfirmAction();
  const router = useRouter();
  const pathname = usePathname();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [savingLang, setSavingLang] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [roleF, setRoleF] = useState("");
  const [activeF, setActiveF] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    username: "",
    fullName: "",
    role: "locataire",
    email: "",
    phone: "",
    language: DEFAULT_LOCALE as string,
  });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (qDebounced) params.set("q", qDebounced);
    if (roleF) params.set("role", roleF);
    if (activeF) params.set("active", activeF);
    const res = await apiFetch(`/api/users?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { items: UserRow[]; total: number };
      setUsers(data.items);
      setTotal(data.total);
    }
  }, [page, qDebounced, roleF, activeF]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounces the search and resets to page 1 whenever a filter changes.
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [qDebounced, roleF, activeF]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ ...form, email: form.email || undefined, phone: form.phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiError(data, t("createFailed")));
        return;
      }
      setCreated(data);
      setShowForm(false);
      setForm({ username: "", fullName: "", role: "locataire", email: "", phone: "", language: DEFAULT_LOCALE as string });
      if (page === 1) load();
      else setPage(1);
    } catch {
      setError(t("createFailed"));
    } finally {
      setSaving(false);
    }
  }

  function onDeactivate(u: UserRow) {
    return confirmAction({
      level: "danger",
      message: t("confirmDeactivate", { name: u.fullName }),
      confirmLabel: t("deactivate"),
      success: t("deactivated"),
      failure: t("deactivateFailed"),
      run: () => apiFetch(`/api/users/${u.id}`, { method: "DELETE" }),
      onDone: load,
    });
  }

  /**
   * Corrects the language of an existing account. The preference is otherwise
   * only reachable from the switcher, which someone handed an account created
   * in a language they do not read has to find first — in that language.
   *
   * The owner's own browser holds the old value in its stored session until its
   * next token rotation rewrites it from the server (15 minutes at most), at
   * which point `useAuth` moves them onto the corrected locale.
   */
  async function onLanguageChange(u: UserRow, language: string) {
    const previous = u.language;
    setUsers((rows) => rows?.map((r) => (r.id === u.id ? { ...r, language } : r)) ?? rows);
    setSavingLang(u.id);
    try {
      const res = await apiFetch(`/api/users/${u.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setUsers((rows) => rows?.map((r) => (r.id === u.id ? { ...r, language: previous } : r)) ?? rows);
        toast.error(apiError(data, t("saveFailed")));
        return;
      }
      toast.success(t("languageSaved", { name: u.fullName }));
      // Editing one's own row is the one case the interface has to follow. The
      // session is rewritten only now: an expired token makes the request above
      // rotate the refresh cookie first, and the rotation restores the whole
      // stored user — with the language the account had a moment ago.
      if (getSession()?.user.id === u.id) {
        updateSessionUser({ language });
        router.replace(`/${language}${pathname.replace(/^\/[^/]+/, "")}`);
      }
    } finally {
      setSavingLang(null);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">{t("title")}</h1>
        <button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("cancel") : t("create")}
        </button>
      </div>

      {created && (
        <Card className="mb-6 border-emerald-300 bg-emerald-50">
          <p className="font-semibold text-emerald-900">
            {t("createdTitle", { name: created.user.fullName })}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            {t("createdHint")}{" "}
            <code className="rounded bg-white px-2 py-0.5 font-mono font-bold">
              {created.user.username} / {created.tempPassword}
            </code>
          </p>
          <button
            className="mt-3 text-sm font-medium text-emerald-700 underline"
            onClick={() => setCreated(null)}
          >
            {t("createdDismiss")}
          </button>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("fullName")}>
              <input
                className={inputCls}
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                required
                minLength={2}
              />
            </Field>
            <Field label={t("username")}>
              <input
                className={inputCls}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                required
                minLength={3}
              />
            </Field>
            <Field label={t("role")}>
              <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>
                <option value="locataire">{tRole("locataire")}</option>
                <option value="bailleur">{tRole("bailleur")}</option>
              </select>
            </Field>
            <Field label={t("language")}>
              <select
                className={inputCls}
                value={form.language}
                onChange={(e) => set("language", e.target.value)}
              >
                {/* Endonyms, so the admin reads each option as its own
                    speakers would — and a fourth locale never has to be
                    remembered here on top of LOCALES. */}
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {tLang(l)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("email")}>
              <input
                className={inputCls}
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label={t("phone")}>
              <input
                className={inputCls}
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                required
                minLength={6}
                maxLength={20}
              />
            </Field>
            <div className="sm:col-span-2">
              <ErrorText>{error}</ErrorText>
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "…" : t("submit")}
              </button>
            </div>
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
        <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className={`${inputCls} w-auto`} aria-label={t("role")}>
          <option value="">{t("filterAllRoles")}</option>
          <option value="admin">{tRole("admin")}</option>
          <option value="bailleur">{tRole("bailleur")}</option>
          <option value="locataire">{tRole("locataire")}</option>
        </select>
        <select value={activeF} onChange={(e) => setActiveF(e.target.value)} className={`${inputCls} w-auto`} aria-label={t("status")}>
          <option value="">{t("filterAllStatus")}</option>
          <option value="1">{t("active")}</option>
          <option value="0">{t("inactive")}</option>
        </select>
      </div>

      {!users ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">{t("fullName")}</th>
                <th className="px-4 py-3">{t("username")}</th>
                <th className="px-4 py-3">{t("role")}</th>
                <th className="px-4 py-3">{t("language")}</th>
                <th className="px-4 py-3">{t("contact")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3">{tRole(u.role)}</td>
                  <td className="px-4 py-3">
                    <select
                      className={`${inputCls} w-auto py-1 text-xs`}
                      value={LOCALES.includes(u.language as Locale) ? u.language : DEFAULT_LOCALE}
                      disabled={savingLang === u.id}
                      aria-label={t("language")}
                      onChange={(e) => void onLanguageChange(u, e.target.value)}
                    >
                      {LOCALES.map((l) => (
                        <option key={l} value={l}>
                          {tLang(l)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.email ?? u.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {t("active")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {t("inactive")}
                      </span>
                    )}
                    {u.firstLogin && u.isActive && (
                      <span className="ml-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        {t("firstLogin")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== "admin" && u.isActive && (
                      <button
                        className={`${btnSecondary} px-2 py-1 text-xs`}
                        onClick={() => onDeactivate(u)}
                      >
                        {t("deactivate")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
