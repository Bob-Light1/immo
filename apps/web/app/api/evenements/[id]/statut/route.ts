import { NextRequest } from "next/server";
import { evenementDecisionSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { decideEvenement } from "@/lib/services/evenement.service";

/** Approbation / rejet d'un événement — Admin (§5.5). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const { statut } = evenementDecisionSchema.parse(await req.json());
    const ev = await decideEvenement(params.id, statut);
    await audit(req, user.sub, "evenement.decision", "evenement", params.id, { statut });
    return json(ev);
  });
}
