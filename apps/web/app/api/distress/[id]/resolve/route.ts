import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { resolveDistress } from "@/lib/services/distress.service";

/** Marque un signal de détresse résolu — Admin (§5.8). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const res = await resolveDistress(params.id, user.sub);
    await audit(req, user.sub, "distress.resolve", "distress_signal", params.id);
    return json(res);
  });
}
