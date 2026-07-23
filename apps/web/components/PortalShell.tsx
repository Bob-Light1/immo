"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/client/useAuth";
import { logoutSession, type SessionUser } from "@/lib/client/session";
import { Spinner } from "./ui";
import { Logo } from "./Brand";
import { NotificationBell } from "./NotificationBell";
import { DistressButton } from "./DistressButton";
import { ThemeToggle } from "./ThemeToggle";

const NAV: Record<SessionUser["role"], { href: string; key: string }[]> = {
  admin: [
    { href: "/admin", key: "dashboard" },
    { href: "/admin/factures", key: "factures" },
    { href: "/admin/users", key: "users" },
    { href: "/admin/infos", key: "infos" },
    { href: "/admin/annonces", key: "annonces" },
    { href: "/admin/documents", key: "documents" },
    { href: "/admin/suggestions", key: "suggestions" },
    { href: "/admin/evenements", key: "evenements" },
    { href: "/admin/sondages", key: "sondages" },
    { href: "/admin/projets", key: "projets" },
    { href: "/admin/predictions", key: "predictions" },
    { href: "/admin/annuaire", key: "annuaire" },
    { href: "/admin/maintenance", key: "maintenance" },
    { href: "/admin/detresse", key: "detresse" },
    { href: "/admin/profil", key: "profil" },
  ],
  bailleur: [
    { href: "/bailleur", key: "dashboard" },
    { href: "/bailleur/factures", key: "factures" },
    { href: "/bailleur/infos", key: "infos" },
    { href: "/bailleur/annonces", key: "annonces" },
    { href: "/bailleur/documents", key: "documents" },
    { href: "/bailleur/suggestions", key: "suggestions" },
    { href: "/bailleur/evenements", key: "evenements" },
    { href: "/bailleur/sondages", key: "sondages" },
    { href: "/bailleur/projets", key: "projets" },
    { href: "/bailleur/predictions", key: "predictions" },
    { href: "/bailleur/annuaire", key: "annuaire" },
    { href: "/bailleur/maintenance", key: "maintenance" },
    { href: "/bailleur/profil", key: "profil" },
  ],
  locataire: [
    { href: "/locataire", key: "mesFactures" },
    { href: "/locataire/infos", key: "infos" },
    { href: "/locataire/documents", key: "documents" },
    { href: "/locataire/suggestions", key: "suggestions" },
    { href: "/locataire/evenements", key: "evenements" },
    { href: "/locataire/sondages", key: "sondages" },
    { href: "/locataire/projets", key: "projets" },
    { href: "/locataire/predictions", key: "predictions" },
    { href: "/locataire/annuaire", key: "annuaire" },
    { href: "/locataire/maintenance", key: "maintenance" },
    { href: "/locataire/profil", key: "profil" },
  ],
};

// Regroupement par section (ordre fixe). Une section n'apparaît que si le
// rôle possède au moins un de ses liens — la barre reste lisible malgré ~15 entrées.
const GROUPS: { label: string; keys: string[] }[] = [
  { label: "main", keys: ["dashboard", "mesFactures", "factures", "users"] },
  {
    label: "communaute",
    keys: ["infos", "annonces", "documents", "suggestions", "evenements", "sondages", "projets", "predictions", "annuaire"],
  },
  { label: "gestion", keys: ["maintenance", "detresse"] },
  { label: "compte", keys: ["profil"] },
];

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
              const full = `/${locale}${href}`;
              const active = pathname === full || (href !== `/${role}` && pathname.startsWith(full));
              return (
                <Link
                  key={href}
                  href={full}
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
 * Coquille commune des trois portails : garde d'authentification par rôle,
 * barre supérieure et navigation latérale (fixe en desktop, tiroir en mobile).
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
  const [open, setOpen] = useState(false);

  if (!user) return <Spinner />;

  async function logout() {
    await logoutSession();
    router.replace(`/${locale}/login`);
  }

  return (
    <div className="min-h-screen">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <button
            onClick={() => setOpen(true)}
            aria-label={t("openMenu")}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <Link href={`/${locale}/${role}`} aria-label="KingCity">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <DistressButton />
            <NotificationBell />
            <span className="hidden text-sm text-slate-600 md:inline">
              {user.fullName} · <span className="font-medium">{t(`role.${user.role}`)}</span>
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {t("logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation latérale fixe (desktop) */}
      <aside className="fixed bottom-0 left-0 top-14 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white lg:block">
        <SideNav role={role} locale={locale} pathname={pathname} />
      </aside>

      {/* Tiroir mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="cg-drawer absolute bottom-0 left-0 top-0 w-72 max-w-[85%] overflow-y-auto bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <Logo size="sm" />
              <button
                onClick={() => setOpen(false)}
                aria-label={t("closeMenu")}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SideNav role={role} locale={locale} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
