import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { CalculationError, type ErrorCode, type ErrorParams } from "@campusgest/shared";
import { AuthError } from "./rbac";

/**
 * Business error carrying an HTTP status code.
 *
 * `message` is the default-locale sentence — logs, and any consumer that is not
 * the UI. `code` is what the interface translates: the reader may be looking at
 * the app in a language nobody on the server knows about.
 */
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: ErrorCode,
    public params?: ErrorParams,
  ) {
    super(message);
  }
}

/**
 * Recursively serializes a value for JSON:
 *  - BigInt  -> number (XAF amounts, within the safe integer range)
 *  - Decimal -> number (coefficients)
 *  - Date    -> ISO string
 */
export function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    // Prisma.Decimal (decimal.js). Detected via isDecimal: the class name is
    // minified in a production build, so `constructor.name` cannot be
    // relied on.
    if (Prisma.Decimal.isDecimal(value)) return Number(value.toString());
    if (Array.isArray(value)) return value.map(serialize);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(serialize(data), init);
}

/**
 * Constraint violations that carry a business meaning. Reaching one is a
 * legitimate outcome of a valid request racing another, not a server fault, so
 * they must not surface as a 500 — the caller can act on every message here.
 */
function prismaMessage(
  e: Prisma.PrismaClientKnownRequestError,
): { status: number; error: string; code: ErrorCode } | null {
  switch (e.code) {
    case "P2002": {
      // Unique violation. The invoice keys are the ones a user can actually
      // trip; anything else stays generic rather than leaking a column name.
      const target = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]).join(",") : String(e.meta?.target ?? "");
      if (target.includes("type_key") || target.includes("typeKey")) {
        return {
          status: 409,
          error: "Une facture de ce type existe déjà pour cette période.",
          code: "facture.doublonTypeMois",
        };
      }
      if (target.includes("loyer")) {
        return {
          status: 409,
          error: "Une facture de loyer existe déjà pour cette année.",
          code: "facture.doublonLoyerAnnee",
        };
      }
      return { status: 409, error: "Cet enregistrement existe déjà.", code: "generic.doublon" };
    }
    // Foreign key violation: an id that points at nothing (e.g. an unknown
    // compteur on an invoice) is bad input, not a server error.
    case "P2003":
      return {
        status: 400,
        error: "Référence inexistante dans la requête.",
        code: "generic.referenceInexistante",
      };
    // Update/delete targeting a row that vanished (or never existed).
    case "P2025":
      return { status: 404, error: "Enregistrement introuvable.", code: "generic.introuvable" };
    default:
      return null;
  }
}

/**
 * Lifts the code a refinement attached to its issue (see `issueCode`) into the
 * response. A rule written as a refinement is one whose wording the reader has
 * to act on — an inconsistent deadline, a month in the wrong format — and
 * answering all of them with "invalid input" leaves them guessing which field
 * to look at. Field-level checks stay generic: the form already marks them.
 *
 * The first coded issue wins; Zod reports them in schema order, which is the
 * order the rules were written to be read in.
 */
function zodError(e: ZodError): { error: string; code: ErrorCode; params?: ErrorParams } {
  for (const issue of e.issues) {
    if (issue.code !== "custom") continue;
    const { code, ...params } = (issue.params ?? {}) as { code?: ErrorCode } & ErrorParams;
    if (!code) continue;
    return {
      error: issue.message,
      code,
      params: Object.keys(params).length > 0 ? params : undefined,
    };
  }
  return { error: "Entrée invalide", code: "generic.entreeInvalide" };
}

/**
 * Wraps a route handler: centralizes error handling.
 *
 * Every branch answers with `{ error, code }` — see `ApiErrorBody`. The code is
 * what the interface renders, in the locale the reader is on; `error` is the
 * default-locale sentence kept for logs and non-UI consumers.
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceError) {
      return NextResponse.json(
        { error: e.message, code: e.code, params: e.params },
        { status: e.status },
      );
    }
    // Thrown by the pure calculation layer, which cannot import ServiceError.
    if (e instanceof CalculationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    if (e instanceof ZodError) {
      // `details` is diagnostic only — the per-field sentences come from Zod in
      // its own language and are never rendered.
      return NextResponse.json({ ...zodError(e), details: e.flatten() }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = prismaMessage(e);
      if (mapped) {
        return NextResponse.json(
          { error: mapped.error, code: mapped.code },
          { status: mapped.status },
        );
      }
    }
    console.error("[api]", e);
    return NextResponse.json({ error: "Erreur serveur", code: "generic.serveur" }, { status: 500 });
  }
}
