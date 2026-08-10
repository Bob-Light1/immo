"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { LOCALES, type Locale } from "@campusgest/shared";
import { restoreSession, type SessionUser } from "./session";

/**
 * Client-side authentication guard.
 * - No session (neither local token nor valid refresh cookie) -> /login.
 * - Interface locale different from the account preference -> same route under
 *   the preferred prefix.
 * - Wrong role -> redirect to the portal of the actual role.
 * - first_login still true -> force a pass through /change-credentials.
 * Returns the user once validated (null while redirecting).
 */
export function useAuth(requiredRole?: SessionUser["role"]): SessionUser | null {
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((s) => {
      if (cancelled) return;
      if (!s) {
        router.replace(`/${locale}/login`);
        return;
      }
      // The account preference follows the resident across devices, which the
      // per-browser NEXT_LOCALE cookie cannot do on its own — a second phone
      // would otherwise open in the default locale. The switcher updates the
      // stored session before navigating, so this never fights a live choice.
      const preferee = s.user.language;
      if (preferee !== locale && LOCALES.includes(preferee as Locale)) {
        // The query string carries the filters the resident is looking at;
        // dropping it here would silently reset the screen they landed on.
        router.replace(`/${preferee}${pathname.replace(/^\/[^/]+/, "")}${window.location.search}`);
        return;
      }
      if (s.user.firstLogin) {
        router.replace(`/${locale}/change-credentials`);
        return;
      }
      if (requiredRole && s.user.role !== requiredRole) {
        router.replace(`/${locale}/${s.user.role}`);
        return;
      }
      setUser(s.user);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, pathname, requiredRole, router]);

  return user;
}
