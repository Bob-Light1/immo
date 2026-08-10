import { NextRequest } from "next/server";
import { twoFactorDisableSchema } from "@campusgest/shared";
import { handle, json, ServiceError } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { verifyTotp } from "@/lib/totp";

/** Disables 2FA after validating one last code (§9). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = requireRole(req, "admin");
    const { code } = twoFactorDisableSchema.parse(await req.json());
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.sub },
      select: { totpSecret: true },
    });
    if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) {
      throw new ServiceError(400, "Code invalide.", "auth.codeInvalide");
    }
    await prisma.user.update({ where: { id: auth.sub }, data: { totpSecret: null } });
    await audit(req, auth.sub, "auth.2fa_disabled", "user", auth.sub);
    return json({ enabled: false });
  });
}
