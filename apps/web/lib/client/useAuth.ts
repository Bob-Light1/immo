"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { getSession, type SessionUser } from "./session";

/**
 * Garde d'authentification côté client.
 * - Pas de session -> redirige vers /login.
 * - Mauvais rôle -> redirige vers le portail du rôle réel.
 * - first_login encore vrai -> force le passage par /change-credentials.
 * Retourne l'utilisateur une fois validé (null pendant la redirection).
 */
export function useAuth(requiredRole?: SessionUser["role"]): SessionUser | null {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const s = getSession();
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
  }, [locale, requiredRole, router]);

  return user;
}
