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

/** Extrait et vérifie le JWT depuis l'en-tête Authorization: Bearer <token>. */
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

/** Vérifie que l'utilisateur authentifié a l'un des rôles autorisés. */
export function requireRole(req: NextRequest, ...roles: Role[]): JwtPayload {
  const payload = requireAuth(req);
  if (!roles.includes(payload.role)) {
    throw new AuthError(403, "Accès refusé pour ce rôle.");
  }
  return payload;
}
