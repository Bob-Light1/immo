import type { SessionUser } from "./session";
import type { NavIconName } from "@/components/NavIcons";

/**
 * Navigation map of the three portals. It lives here rather than in the shell
 * because two components read it — the drawer/sidebar lists it whole, the
 * mobile tab bar promotes a handful of entries out of it — and a second copy
 * would drift the day a route is added.
 */
export const NAV: Record<SessionUser["role"], { href: string; key: string }[]> = {
  admin: [
    { href: "/admin", key: "dashboard" },
    { href: "/admin/factures", key: "factures" },
    { href: "/admin/chambres", key: "chambres" },
    { href: "/admin/compteurs", key: "compteurs" },
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

// Grouping by section (fixed order). A section only shows when the role owns
// at least one of its links — the bar stays readable despite ~15 entries.
export const GROUPS: { label: string; keys: string[] }[] = [
  { label: "main", keys: ["dashboard", "mesFactures", "factures", "chambres", "compteurs", "users"] },
  {
    label: "communaute",
    keys: ["infos", "annonces", "documents", "suggestions", "evenements", "sondages", "projets", "predictions", "annuaire"],
  },
  { label: "gestion", keys: ["maintenance", "detresse"] },
  { label: "compte", keys: ["profil"] },
];

/**
 * Four entries promoted to the mobile tab bar, plus a fifth slot opening the
 * drawer over everything else. Four is what a 320px screen fits at a usable
 * touch size; the rest of the role's ~15 pages stay one tap further away.
 */
export const TABS: Record<SessionUser["role"], string[]> = {
  admin: ["dashboard", "factures", "users", "maintenance"],
  bailleur: ["dashboard", "factures", "infos", "maintenance"],
  locataire: ["mesFactures", "infos", "maintenance", "profil"],
};

export const TAB_ICONS: Record<string, NavIconName> = {
  dashboard: "dashboard",
  factures: "factures",
  mesFactures: "factures",
  users: "users",
  infos: "infos",
  maintenance: "maintenance",
  profil: "profil",
};

/**
 * A link is current when the path matches it exactly, or sits under it. The
 * prefix rule is skipped for a portal's root (`/admin`), which is a prefix of
 * every one of its pages and would otherwise never stop being highlighted.
 */
export function isActive(pathname: string, locale: string, role: string, href: string): boolean {
  const full = `/${locale}${href}`;
  return pathname === full || (href !== `/${role}` && pathname.startsWith(full));
}
