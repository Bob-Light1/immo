"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { restoreSession, type SessionUser } from "./session";

/**
 * Client-side authentication guard.
 * - No session (neither local token nor valid refresh cookie) -> /login.
 * - Wrong role -> redirect to the portal of the actual role.
 * - first_login still true -> force a pass through /change-credentials.
 * Returns the user once validated (null while redirecting).
 */
export function useAuth(requiredRole?: SessionUser["role"]): SessionUser | null {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((s) => {
      if (cancelled) return;
      if (!s) {
        router.replace(`/${locale}/login`);
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
  }, [locale, requiredRole, router]);

  return user;
}
