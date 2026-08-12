import type { SVGProps } from "react";

/**
 * Line icons for the mobile tab bar. Drawn on the same 24 grid, 2px stroke and
 * `currentColor` as the bell and the drawer's close cross, so the whole shell
 * reads as one set — a tab bar is the one place where an icon carries the
 * meaning on its own, and a mismatched weight is immediately visible.
 */
export type NavIconName =
  | "dashboard"
  | "factures"
  | "users"
  | "infos"
  | "maintenance"
  | "profil"
  | "plus";

const PATHS: Record<NavIconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  factures: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
      <path d="M15 4.6a3.5 3.5 0 0 1 0 6.8" />
    </>
  ),
  infos: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  maintenance: (
    <>
      <path d="M14.6 6.1a1 1 0 0 0 0 1.4l1.9 1.9a1 1 0 0 0 1.4 0l2.5-2.5a6 6 0 0 1-7.9 7.4l-5.6 5.6a2 2 0 0 1-2.8-2.8l5.6-5.6a6 6 0 0 1 7.4-7.9z" />
    </>
  ),
  profil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
    </>
  ),
  plus: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
};

export function NavIcon({ name, ...props }: { name: NavIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
