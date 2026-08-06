"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { Spinner } from "@/components/ui";
import { restoreSession } from "@/lib/client/session";

/**
 * Point d'entrée de l'application. C'est aussi le `start_url` du manifeste PWA
 * et la cible des notifications push : un utilisateur déjà connecté doit y
 * retrouver son portail, pas la page vitrine. On tente donc une reprise de
 * session (cookie refresh) avant d'afficher l'accueil public.
 */
export default function HomePage() {
  const t = useTranslations("home");
  const locale = useLocale();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((s) => {
      if (cancelled) return;
      if (!s) {
        setChecking(false);
        return;
      }
      router.replace(
        s.user.firstLogin ? `/${locale}/change-credentials` : `/${locale}/${s.user.role}`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  if (checking) return <Spinner />;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <Logo size="lg" />
      <p className="max-w-md text-slate-600">{t("tagline")}</p>
      <Link
        href={`/${locale}/login`}
        className="rounded-lg bg-navy px-6 py-2.5 font-semibold text-white transition hover:bg-navy-dark"
      >
        {t("login")}
      </Link>
      <p className="text-xs text-slate-400">{t("status")}</p>
    </main>
  );
}
