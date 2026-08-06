import createMiddleware from "next-intl/middleware";
import { LOCALES, DEFAULT_LOCALE } from "@campusgest/shared";

export default createMiddleware({
  locales: LOCALES as unknown as string[],
  defaultLocale: DEFAULT_LOCALE,
  localeDetection: true,
});

export const config = {
  // Everything except /api, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
