"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { Spinner } from "@/components/ui";
import { restoreSession } from "@/lib/client/session";

/**
 * Application entry point. It is also the PWA manifest's `start_url` and the
 * target of push notifications: an already signed-in user must land on their
 * portal, not on the marketing page. A session recovery (refresh cookie) is
 * therefore attempted before rendering the public home page.
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
    <main className="cg-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
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
