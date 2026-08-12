import { useTranslations } from "next-intl";
import Link from "next/link";

export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="cg-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-5xl font-extrabold text-navy">404</h1>
      <p className="text-slate-600">{t("notFound")}</p>
      <Link href="/" className="font-medium text-brand hover:underline">
        {t("backHome")}
      </Link>
    </main>
  );
}
