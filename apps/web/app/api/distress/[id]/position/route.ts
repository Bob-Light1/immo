import { NextRequest } from "next/server";
import { distressPositionSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { attachDistressPosition } from "@/lib/services/distress.service";

/**
 * Attaches the position to an already-broadcast signal (§5.8). POST
 * /api/distress fires immediately on the 5 clicks; geolocation — which needs
 * the user's consent and several seconds of GPS reading — is never allowed to
 * delay the alert. It completes it here.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    const pos = distressPositionSchema.parse(await req.json());
    const res = await attachDistressPosition(params.id, user.sub, pos);
    if (!res.alreadySet) {
      await audit(req, user.sub, "distress.position", "distress_signal", params.id);
    }
    return json(res);
  });
}
