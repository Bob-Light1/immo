import { NextRequest } from "next/server";
import { createChambreSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { createChambre, listChambres } from "@/lib/services/chambre.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** The rooms, their tariffs and who occupies them. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    return json(await listChambres());
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("chambre", admin.sub);
    const input = createChambreSchema.parse(await req.json());
    const chambre = await createChambre(input);
    await audit(req, admin.sub, "chambre.create", "chambre", chambre.id, input);
    return json(chambre, { status: 201 });
  });
}
