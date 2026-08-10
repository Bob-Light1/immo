import { NextRequest } from "next/server";
import { coefficientsSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { setCoefficients } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("facture", admin.sub);
    const input = coefficientsSchema.parse(await req.json());
    const facture = await setCoefficients(params.id, input);
    await audit(req, admin.sub, "facture.set_coefficients", "facture", params.id);
    return json(facture);
  });
}
