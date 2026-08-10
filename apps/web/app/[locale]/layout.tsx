import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE } from "@campusgest/shared";
import { UiProvider } from "@/components/Toast";
import "../globals.css";

/**
 * The manifest declares the installed app's language, so it has to follow the
 * locale the resident installed from — otherwise every home-screen entry
 * announces itself in French. One static file per locale (`manifest.<loc>.json`,
 * default locale keeps `manifest.json` so the service worker precache and the
 * install prompt find it at the usual path); their `description` must be kept in
 * step with `messages/*.json` by hand.
 */
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    title: "KingCity",
    description: t("tagline"),
    manifest: locale === DEFAULT_LOCALE ? "/manifest.json" : `/manifest.${locale}.json`,
    // iOS ignores the manifest icons: the home screen uses apple-touch-icon.
    icons: { apple: "/icons/icon-192.png" },
    appleWebApp: { capable: true, statusBarStyle: "default", title: "KingCity" },
  };
}

export const viewport: Viewport = {
  themeColor: "#1A3C6E",
  // Fills the area under the notch in standalone mode.
  viewportFit: "cover",
};

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Applies the theme before rendering to avoid the flash (FOUC). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cg_theme');var d=t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-slate-50 text-slate-900">
        <NextIntlClientProvider messages={messages}>
          <UiProvider>{children}</UiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
