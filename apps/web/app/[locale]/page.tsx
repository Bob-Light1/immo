import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/Brand";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <Logo size="lg" />
      <p className="max-w-md text-slate-600">{t("tagline")}</p>
      <Link
        href="login"
        className="rounded-lg bg-navy px-6 py-2.5 font-semibold text-white transition hover:bg-navy-dark"
      >
        {t("login")}
      </Link>
      <p className="text-xs text-slate-400">{t("status")}</p>
    </main>
  );
}
