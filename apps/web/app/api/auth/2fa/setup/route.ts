import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { generateSecret, otpauthUri } from "@/lib/totp";

/**
 * Starts 2FA enrolment (Admin): generates a TOTP secret, not yet persisted.
 * The client stores it in their authenticator app then confirms through
 * /api/auth/2fa/verify with a valid code (§9).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = requireRole(req, "admin");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.sub },
      select: { username: true },
    });
    const secret = generateSecret();
    return json({ secret, otpauth: otpauthUri(secret, user.username) });
  });
}
