"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/client/useAuth";
import { logoutSession, type SessionUser } from "@/lib/client/session";
import { disablePush } from "@/lib/client/push";
import { clearUnreadBadge } from "@/lib/client/badge";
import { useConfirm } from "./Toast";
import { Spinner } from "./ui";
import { Logo } from "./Brand";
import { NotificationBell } from "./NotificationBell";
import { DistressButton } from "./DistressButton";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BottomNav } from "./BottomNav";
import { NAV, GROUPS, isActive } from "@/lib/client/nav";


function SideNav({
  role,
  locale,
  pathname,
  onNavigate,
}: {
  role: SessionUser["role"];
  locale: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const byKey = new Map(NAV[role].map((item) => [item.key, item.href]));

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {GROUPS.map((group) => {
        const links = group.keys.filter((k) => byKey.has(k));
        if (links.length === 0) return null;
        return (
          <div key={group.label} className="mb-1">
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t(`group.${group.label}`)}
            </p>
            {links.map((key) => {
              const href = byKey.get(key)!;
              const active = isActive(pathname, locale, role, href);
              return (
                <Link
                  key={href}
                  href={`/${locale}${href}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t(key)}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Shared shell of the three portals: role-based authentication guard, top bar
 * and side navigation (fixed on desktop, drawer on mobile).
 */
export function PortalShell({
  role,
  children,
}: {
  role: SessionUser["role"];
  children: ReactNode;
}) {
  const user = useAuth(role);
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);

  if (!user) return <Spinner />;

  async function logout() {
    // Logging out is one tap away from every screen, including a half-filled
    // form, and nothing here is saved as it is typed.
    const { ok } = await confirm({ message: t("confirmLogout"), confirmLabel: t("logout") });
    if (!ok) return;
    // Unsubscribe the device before ending the session: otherwise the push
    // subscription stays attached to the outgoing account and the next account
    // on this phone would receive its notifications.
    await disablePush().catch(() => {});
    // Likewise for the icon: the count belongs to the outgoing account.
    clearUnreadBadge();
    await logoutSession();
    router.replace(`/${locale}/login`);
  }

  return (
    // `cg-screen`, not `min-h-screen`: on iOS the latter leaves every page with
    // ~60px of phantom scroll, which alone would make the tab bar hide itself.
    <div className="cg-screen">
      {/*
       * Top bar. Seven controls do not fit the ~336px a 360px phone leaves, so
       * the bar keeps only what has to be reachable in one tap from any screen —
       * brand, distress signal (§5.8), notifications, language — and hands the
       * rest (theme, identity, sign-out) to the drawer footer below `lg`.
       * Navigation itself moved to the tab bar at the bottom of the screen.
       */}
      <header className="cg-safe-top cg-safe-x sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Link href={`/${locale}/${role}`} aria-label="KingCity" className="min-w-0 shrink">
            <Logo />
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <DistressButton />
            <NotificationBell />
            <LanguageSwitcher />
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <span className="hidden text-sm text-slate-600 xl:inline">
              {user.fullName} · <span className="font-medium">{t(`role.${user.role}`)}</span>
            </span>
            <button
              onClick={logout}
              className="hidden rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 lg:inline-flex"
            >
              {t("logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Fixed side navigation (desktop) */}
      <aside className="fixed bottom-0 left-0 top-14 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white lg:block">
        <SideNav role={role} locale={locale} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="cg-drawer absolute bottom-0 left-0 top-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="cg-safe-top flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <Logo size="sm" />
              <button
                onClick={() => setOpen(false)}
                aria-label={t("closeMenu")}
                className="-mr-1 rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* Only the links scroll: the account block stays reachable however
                long the role's menu is. */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <SideNav role={role} locale={locale} pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <div className="cg-safe-bottom shrink-0 border-t border-slate-200 p-3">
              <p className="truncate px-1 text-sm font-medium text-slate-700">{user.fullName}</p>
              <p className="px-1 pb-2 text-xs text-slate-500">{t(`role.${user.role}`)}</p>
              <div className="flex items-center gap-2">
                {/* From `sm` the theme toggle is back in the top bar. */}
                <div className="sm:hidden">
                  <ThemeToggle />
                </div>
                <button
                  onClick={logout}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  {t("logout")}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <BottomNav
        role={role}
        locale={locale}
        pathname={pathname}
        menuOpen={open}
        onOpenMenu={() => setOpen(true)}
      />

      {/* The tab bar is fixed, so the last rows of a long page would sit under
          it without this clearance (its height plus the home indicator). */}
      <main className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
