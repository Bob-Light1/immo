import { NextRequest } from "next/server";
import { annulationPaiementSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { cancelPaiement } from "@/lib/services/paiement.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/**
 * Cancels a wrongly recorded payment and restores the line's balance (§5.2).
 * The payment row goes away, so the audit entry — reason included — is the only
 * remaining account of it: it is written even though the row it points at no
 * longer exists, which is precisely the point.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("paiement", admin.sub);
    const { motif } = annulationPaiementSchema.parse(await req.json());
    const result = await cancelPaiement(params.id);
    await audit(req, admin.sub, "paiement.cancel", "paiement", params.id, {
      motif,
      montantAnnule: result.montantAnnule,
      ligneId: result.ligneId,
    });
    return json(result);
  });
}
