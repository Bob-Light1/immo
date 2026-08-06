import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { closeSondage } from "@/lib/services/sondage.service";

/** Closes a poll — Admin (§5.13). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const res = await closeSondage(params.id);
    await audit(req, user.sub, "sondage.close", "sondage", params.id);
    return json(res);
  });
}
