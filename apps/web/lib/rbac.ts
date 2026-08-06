import { NextRequest } from "next/server";
import { verifyAccessToken } from "./auth";
import type { JwtPayload, Role } from "@campusgest/shared";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Extracts and verifies the JWT from the Authorization: Bearer <token> header. */
export function requireAuth(req: NextRequest): JwtPayload {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError(401, "Token manquant.");
  }
  try {
    return verifyAccessToken(header.slice(7));
  } catch {
    throw new AuthError(401, "Token invalide ou expiré.");
  }
}

/** Ensures the authenticated user holds one of the allowed roles. */
export function requireRole(req: NextRequest, ...roles: Role[]): JwtPayload {
  const payload = requireAuth(req);
  if (!roles.includes(payload.role)) {
    throw new AuthError(403, "Accès refusé pour ce rôle.");
  }
  return payload;
}
