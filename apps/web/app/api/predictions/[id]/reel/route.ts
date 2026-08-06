import { NextRequest } from "next/server";
import { predictionReelSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setMontantReel } from "@/lib/services/prediction.service";

/** Records a prediction's actual amount (estimated vs actual) — Admin (§5.11). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const { montantReel } = predictionReelSchema.parse(await req.json());
    const res = await setMontantReel(params.id, montantReel);
    await audit(req, user.sub, "prediction.reel", "prediction_facture", params.id, { montantReel });
    return json(res);
  });
}
