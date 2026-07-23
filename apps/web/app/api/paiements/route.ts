import { NextRequest } from "next/server";
import { paiementSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recordPaiement } from "@/lib/services/paiement.service";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const input = paiementSchema.parse(await req.json());
    const paiement = await recordPaiement(admin.sub, input);
    await audit(req, admin.sub, "paiement.create", "paiement", paiement.id, {
      montant: input.montant,
      mode: input.mode,
    });
    return json(paiement, { status: 201 });
  });
}
