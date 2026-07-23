import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/api";
import { AuthError } from "@/lib/rbac";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth";

/**
 * Rotation du refresh token (conception §4) : vérifie le cookie HttpOnly,
 * contrôle token_version (révocation) et l'activité du compte, puis émet
 * un nouveau couple access + refresh.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const token = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!token) throw new AuthError(401, "Refresh token manquant.");

    let payload: { sub: string; ver: number };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AuthError(401, "Refresh token invalide ou expiré.");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      throw new AuthError(401, "Session révoquée.");
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
    const refreshToken = signRefreshToken({ sub: user.id, ver: user.tokenVersion });

    const res = json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        firstLogin: user.firstLogin,
        language: user.language,
      },
    });
    res.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return res;
  });
}
