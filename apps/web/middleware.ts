import createMiddleware from "next-intl/middleware";
import { LOCALES, DEFAULT_LOCALE } from "@campusgest/shared";

export default createMiddleware({
  locales: LOCALES as unknown as string[],
  defaultLocale: DEFAULT_LOCALE,
  localeDetection: true,
});

export const config = {
  // Everything except /api, /storage (object passthrough), Next internals and
  // static files. Locale negotiation has no business rewriting a binary URL.
  matcher: ["/((?!api|storage|_next|_vercel|.*\\..*).*)"],
};
