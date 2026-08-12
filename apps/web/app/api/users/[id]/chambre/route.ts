import { NextRequest } from "next/server";
import { assignChambreSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { assignerChambre } from "@/lib/services/chambre.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/**
 * Moves a tenant into a room, or out of it. Admin only, and audited: the room a
 * tenant occupies is what their rent is read from.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("chambre", admin.sub);
    const input = assignChambreSchema.parse(await req.json());
    const result = await assignerChambre(params.id, input.roomId);
    await audit(req, admin.sub, "user.chambre", "user", params.id, input);
    return json(result);
  });
}
