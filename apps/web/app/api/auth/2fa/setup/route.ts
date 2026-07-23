import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { generateSecret, otpauthUri } from "@/lib/totp";

/**
 * Démarre l'activation 2FA (Admin) : génère un secret TOTP non encore persisté.
 * Le client l'enregistre dans son app d'authentification puis confirme via
 * /api/auth/2fa/verify avec un code valide (§9).
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
