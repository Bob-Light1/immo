import jwt, { type SignOptions } from "jsonwebtoken";
import type { JwtPayload, Role } from "@campusgest/shared";

const ACCESS_SECRET = process.env.JWT_SECRET ?? "dev-access-secret-change-me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me";
// Les TTL viennent de l'env (string). @types/jsonwebtoken attend `number | StringValue`.
const ACCESS_TTL = (process.env.ACCESS_TOKEN_TTL ?? "15m") as SignOptions["expiresIn"];
const REFRESH_TTL = (process.env.REFRESH_TOKEN_TTL ?? "7d") as SignOptions["expiresIn"];

export function signAccessToken(payload: {
  sub: string;
  role: Role;
  ver: number;
}): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload: { sub: string; ver: number }): string {
  // jti : chaque refresh token émis est unique (rotation traçable).
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
    jwtid: crypto.randomUUID(),
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string; ver: number } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string; ver: number };
}

export const REFRESH_COOKIE = "refresh_token";

/** Options communes du cookie refresh (login, rotation, change-credentials). */
export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
