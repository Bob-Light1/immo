import { NextRequest } from "next/server";
import { predictionSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createPrediction, listPredictions } from "@/lib/services/prediction.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Lists the estimates (published to all) — any authenticated user (§5.11). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listPredictions({ page, limit }));
  });
}

/** Creates a charge estimate — Admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = predictionSchema.parse(await req.json());
    const p = await createPrediction(user.sub, input);
    await audit(req, user.sub, "prediction.create", "prediction_facture", p.id, {
      type: input.type,
      mois: input.mois,
    });
    return json(p, { status: 201 });
  });
}
