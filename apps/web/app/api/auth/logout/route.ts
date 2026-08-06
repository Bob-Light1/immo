import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** Logout: invalidates the refresh token (cookie removed). */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions, maxAge: 0 });

  // Best-effort audit: logout works even without a valid Bearer.
  try {
    const auth = requireAuth(req);
    await audit(req, auth.sub, "auth.logout", "user", auth.sub);
  } catch {
    /* token missing or expired: nothing to log */
  }
  return res;
}
