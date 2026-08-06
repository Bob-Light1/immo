import { NextRequest } from "next/server";
import { twoFactorVerifySchema } from "@campusgest/shared";
import { handle, json, ServiceError } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { verifyTotp } from "@/lib/totp";

/** Confirms and enables 2FA: persists the secret when the code is valid (§9). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = requireRole(req, "admin");
    const { secret, code } = twoFactorVerifySchema.parse(await req.json());
    if (!verifyTotp(secret, code)) {
      throw new ServiceError(400, "Code invalide.");
    }
    await prisma.user.update({ where: { id: auth.sub }, data: { totpSecret: secret } });
    await audit(req, auth.sub, "auth.2fa_enabled", "user", auth.sub);
    return json({ enabled: true });
  });
}
