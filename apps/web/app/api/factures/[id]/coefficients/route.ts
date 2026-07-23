import { NextRequest } from "next/server";
import { coefficientsSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setCoefficients } from "@/lib/services/facture.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const input = coefficientsSchema.parse(await req.json());
    const facture = await setCoefficients(params.id, input);
    await audit(req, admin.sub, "facture.set_coefficients", "facture", params.id);
    return json(facture);
  });
}
