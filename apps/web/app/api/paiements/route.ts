import { NextRequest } from "next/server";
import { paiementSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { recordPaiement } from "@/lib/services/paiement.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("paiement", admin.sub);
    const input = paiementSchema.parse(await req.json());
    const paiement = await recordPaiement(admin.sub, input);
    await audit(req, admin.sub, "paiement.create", "paiement", paiement.id, {
      montant: input.montant,
      mode: input.mode,
    });
    return json(paiement, { status: 201 });
  });
}
