"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SessionUser } from "@/lib/client/session";
import { NAV, TABS, TAB_ICONS, isActive } from "@/lib/client/nav";
import { useHideOnScroll } from "@/lib/client/useHideOnScroll";
import { NavIcon } from "./NavIcons";

/**
 * Mobile tab bar. On a phone the residence's daily destinations are worth a
 * thumb-reach tap rather than a trip through a drawer, so four of them sit at
 * the bottom of the screen and the fifth slot opens the full menu.
 *
 * It replaces the top-left burger below `lg`: two affordances for the same
 * drawer only crowd a bar that had no room to begin with. Above `lg` the fixed
 * sidebar takes over and this disappears entirely.
 */
export function BottomNav({
  role,
  locale,
  pathname,
  onOpenMenu,
  menuOpen,
}: {
  role: SessionUser["role"];
  locale: string;
  pathname: string;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const t = useTranslations("nav");
  const byKey = new Map(NAV[role].map((item) => [item.key, item.href]));
  const keys = TABS[role].filter((k) => byKey.has(k));

  // Nothing to step out of the way of while the drawer covers the screen.
  const { hidden, reveal } = useHideOnScroll(!menuOpen);

  // A new page starts at the top, but the router restores the offset without
  // always firing a scroll event — the bar has to be put back explicitly.
  useEffect(reveal, [pathname, reveal]);

  const cell =
    "relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition";

  // The sidebar marks the current page with a filled pill, which is too heavy
  // for a 64px tile; this accent gives the tab bar a cue that does not rely on
  // the label colour alone.
  const accent = <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-navy" />;

  return (
    <nav
      aria-label={t("group.main")}
      // Focus can still reach the bar while it is off-screen — by keyboard, or
      // by a screen reader walking the page — so bring it back rather than let
      // the user chase an invisible target.
      onFocusCapture={reveal}
      className={`cg-safe-pb fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur transition-transform duration-200 motion-reduce:transition-none lg:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {keys.map((key) => {
        const href = byKey.get(key)!;
        const active = !menuOpen && isActive(pathname, locale, role, href);
        return (
          <Link
            key={href}
            href={`/${locale}${href}`}
            aria-current={active ? "page" : undefined}
            className={`${cell} ${active ? "text-navy" : "text-slate-500"}`}
          >
            {active && accent}
            <NavIcon name={TAB_ICONS[key]} className="h-6 w-6 shrink-0" />
            <span className="max-w-full truncate px-0.5">{t(`tab.${key}`)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t("openMenu")}
        aria-expanded={menuOpen}
        className={`${cell} ${menuOpen ? "text-navy" : "text-slate-500"}`}
      >
        {menuOpen && accent}
        <NavIcon name="plus" className="h-6 w-6 shrink-0" />
        <span className="max-w-full truncate px-0.5">{t("tab.plus")}</span>
      </button>
    </nav>
  );
}
