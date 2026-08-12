"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@campusgest/shared";
import { apiFetch, getSession, updateSessionUser } from "@/lib/client/session";

/**
 * Language switcher (design §8.3). Residents do not all read the same language,
 * so the control sits in the top bar and on the login screen rather than behind
 * the profile page: someone who cannot read the current interface would have no
 * way to *find* that page.
 *
 * The interface locale is carried by the URL prefix, so switching is a
 * client-side navigation to the same route under another prefix — the tree
 * re-renders with the new messages, without a reload. The account preference is
 * written in the background: without it, the next sign-in would silently undo
 * the choice, and a second device would start over in French.
 *
 * Options are labelled with their endonyms, identical in all three catalogues.
 * "English" has to read as English to someone whose interface is in German.
 */
export function LanguageSwitcher() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  async function change(next: string) {
    if (next === locale || !LOCALES.includes(next as Locale)) return;

    // The stored session is updated *before* navigating: `useAuth` re-runs as
    // soon as the new prefix renders and sends the resident back to their
    // account language if it still reads the old value.
    const session = getSession();
    if (session) updateSessionUser({ language: next });

    // Swap the locale segment and keep everything else — a resident switching
    // language mid-task stays exactly where they were, filters included.
    const rest = pathname.replace(/^\/[^/]+/, "");
    const search = typeof window === "undefined" ? "" : window.location.search;
    startTransition(() => router.replace(`/${next}${rest}${search}`));

    // The interface has already switched, so a failed write must not block it.
    // Anonymous visitors (login screen) keep the per-device NEXT_LOCALE cookie
    // set by the middleware.
    if (!session) return;
    await apiFetch(`/api/users/${session.user.id}/profile`, {
      method: "PUT",
      body: JSON.stringify({ language: next }),
    }).catch(() => {
      /* preference unsaved: the URL still governs this session */
    });
    // Re-asserted once the write has settled. An expired access token makes
    // `apiFetch` rotate the refresh token first, and the rotation rewrites the
    // whole stored session from the server — with the language the account
    // still had a moment ago. Without this, `useAuth` sees that stale
    // preference and bounces the resident straight back to the old locale.
    updateSessionUser({ language: next });
  }

  return (
    // The chrome is drawn by the label and the native <select> lies over it,
    // invisible: below `sm` the control is the globe alone, so it costs ~36px in
    // a top bar that has no room for the endonym. The globe carries the meaning
    // on its own — better, for a reader of German, than the word "Français".
    // It is borderless there too, reading as one icon among the bar's others;
    // the border comes back with the endonym beside it.
    <label
      className={`relative inline-flex items-center rounded-lg border border-transparent text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-within:ring-2 focus-within:ring-brand sm:border-slate-300 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span className="sr-only">{t("label")}</span>
      <span aria-hidden className="pointer-events-none px-2 py-1.5 text-base leading-none">
        🌐
      </span>
      <span aria-hidden className="pointer-events-none hidden pr-2 sm:inline">{t(locale)}</span>
      <select
        value={locale}
        onChange={(e) => void change(e.target.value)}
        disabled={pending}
        aria-label={t("label")}
        title={t("label")}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
