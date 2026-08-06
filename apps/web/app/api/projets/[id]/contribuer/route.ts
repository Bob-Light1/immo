import { NextRequest } from "next/server";
import { contributionSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { contribuer } from "@/lib/services/projet.service";

/** Contributes to a shared project — any authenticated user (§5.10). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    const { montant } = contributionSchema.parse(await req.json());
    const res = await contribuer(params.id, { sub: user.sub, role: user.role }, montant);
    await audit(req, user.sub, "projet.contribuer", "projet_commun", params.id, { montant });
    return json(res, { status: 201 });
  });
}
