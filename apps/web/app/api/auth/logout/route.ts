import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/auth";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** Déconnexion : invalide le refresh token (suppression du cookie). */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions, maxAge: 0 });

  // Audit best-effort : la déconnexion fonctionne même sans Bearer valide.
  try {
    const auth = requireAuth(req);
    await audit(req, auth.sub, "auth.logout", "user", auth.sub);
  } catch {
    /* token absent/expiré : rien à journaliser */
  }
  return res;
}
