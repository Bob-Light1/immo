import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "./rbac";

/** Erreur métier portant un code HTTP. */
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Sérialise récursivement une valeur pour JSON :
 *  - BigInt  -> number (montants XAF, dans la plage des entiers sûrs)
 *  - Decimal -> number (coefficients)
 *  - Date    -> ISO string
 */
export function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    // Prisma.Decimal (decimal.js). Détection par isDecimal : le nom de
    // classe est minifié en build de production, `constructor.name` ne
    // fonctionne pas.
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

/** Enveloppe un handler de route : centralise la gestion d'erreurs. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Entrée invalide", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("[api]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
