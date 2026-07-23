import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Journal d'audit des actions sensibles (conception FIX-6 / §9).
 * Best-effort : une erreur d'audit ne doit jamais faire échouer l'action.
 */
export async function audit(
  req: NextRequest,
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId: resourceId ?? null,
        ipAddress: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        metadata: metadata ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}

export function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
