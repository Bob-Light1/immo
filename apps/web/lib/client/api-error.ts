"use client";

import { useTranslations } from "next-intl";
import type { ApiErrorBody, ErrorCode, ErrorParams } from "@campusgest/shared";

/**
 * Failed-request messages, in the language on screen.
 *
 * The server answers with a stable `code` plus the values its wording
 * interpolates (see `packages/shared/src/errors.ts`); the sentence it also
 * sends is written in the default locale and is there for the logs. Screens
 * used to render that sentence, so a resident who had switched the interface to
 * German was told what went wrong in French — the one moment the wording
 * matters most.
 *
 * An unknown code falls back to the caller's own message rather than to the
 * server's: a stale client meeting a newer API would otherwise start leaking
 * French again, silently.
 */
export function useApiError(): (body: unknown, fallback: string) => string {
  const t = useTranslations("errors");

  return (body, fallback) => {
    const { code, params } = (body ?? {}) as Partial<ApiErrorBody>;
    if (!code || !t.has(code as ErrorCode)) return fallback;
    return t(code as ErrorCode, params as ErrorParams);
  };
}

/**
 * Error carrying an API error code, for the helpers that cannot be hooks
 * (`uploadFile` runs outside the React tree). Callers translate it with
 * `useApiError`.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: ErrorCode,
    public params?: ErrorParams,
  ) {
    super(message);
  }
}
