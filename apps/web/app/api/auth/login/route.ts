import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginSchema } from "@campusgest/shared";
import { prisma } from "@/lib/prisma";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit, clientIp } from "@/lib/audit";
import { verifyTotp } from "@/lib/totp";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // §9 : 10 essais / 15 min / IP

export async function POST(req: NextRequest) {
  const ip = clientIp(req) ?? "local";
  const limited = rateLimit(`login:ip:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Entrée invalide", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password, totp } = parsed.data;

  // Verrouillage par compte en plus de l'IP (backoff simple, §9).
  const perAccount = rateLimit(`login:user:${username}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!perAccount.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(perAccount.retryAfterSec) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });

  // Réponse uniforme pour ne pas révéler l'existence du compte.
  const invalid = NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });
  if (!user || !user.isActive) {
    await audit(req, null, "auth.login_failed", "user", undefined, { username });
    return invalid;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await audit(req, user.id, "auth.login_failed", "user", user.id);
    return invalid;
  }

  // 2FA TOTP (Admin) : étape supplémentaire post-mot de passe (§9).
  if (user.totpSecret) {
    if (!totp) {
      return NextResponse.json({ twoFactorRequired: true }, { status: 401 });
    }
    if (!verifyTotp(user.totpSecret, totp)) {
      await audit(req, user.id, "auth.login_2fa_failed", "user", user.id);
      return invalid;
    }
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
  const refreshToken = signRefreshToken({ sub: user.id, ver: user.tokenVersion });

  await audit(req, user.id, "auth.login", "user", user.id);

  const res = NextResponse.json({
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
}
