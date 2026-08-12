import { NextRequest } from "next/server";
import { updateChambreSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { deleteChambre, updateChambre } from "@/lib/services/chambre.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/**
 * Corrects a room — most often its annual rent, restated at the turn of the
 * year. The change is audited: it is what next year's invoices will bill.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("chambre", admin.sub);
    const input = updateChambreSchema.parse(await req.json());
    const chambre = await updateChambre(params.id, input);
    await audit(req, admin.sub, "chambre.update", "chambre", params.id, input);
    return json(chambre);
  });
}

/** Only ever a room nobody lives in — an occupant holds it in place. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const result = await deleteChambre(params.id);
    await audit(req, admin.sub, "chambre.delete", "chambre", params.id);
    return json(result);
  });
}
