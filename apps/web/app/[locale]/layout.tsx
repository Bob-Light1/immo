import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { UiProvider } from "@/components/Toast";
import "../globals.css";

export const metadata: Metadata = {
  title: "KingCity",
  description: "Gestion de cité universitaire — Cameroun",
  manifest: "/manifest.json",
  // iOS ignore les icônes du manifeste : l'écran d'accueil utilise apple-touch-icon.
  icons: { apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "KingCity" },
};

export const viewport: Viewport = {
  themeColor: "#1A3C6E",
  // Occupe la zone sous l'encoche en mode standalone.
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
        {/* Applique le thème avant le rendu pour éviter le flash (FOUC). */}
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
