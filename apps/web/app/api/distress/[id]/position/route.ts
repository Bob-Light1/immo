import { NextRequest } from "next/server";
import { distressPositionSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { attachDistressPosition } from "@/lib/services/distress.service";

/**
 * Rattache la position à un signal déjà diffusé (§5.8). Le POST /api/distress
 * part immédiatement aux 5 clics ; la géolocalisation, qui demande l'accord de
 * l'utilisateur et plusieurs secondes de lecture GPS, n'a jamais le droit de
 * retarder l'alerte. Elle la complète ici.
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
