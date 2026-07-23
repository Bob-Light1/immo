import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import { LOCALES } from "@campusgest/shared";

export default getRequestConfig(async ({ locale }) => {
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) notFound();

  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
