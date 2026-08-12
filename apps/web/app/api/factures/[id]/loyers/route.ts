import { NextRequest } from "next/server";
import { loyersSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { setLoyers } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Sets the annual rent owed by each tenant of a draft rent invoice. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("facture", admin.sub);
    const input = loyersSchema.parse(await req.json());
    const facture = await setLoyers(params.id, input);
    await audit(req, admin.sub, "facture.set_loyers", "facture", params.id, input);
    return json(facture);
  });
}
