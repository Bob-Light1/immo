import { NextRequest } from "next/server";
import { distressBanSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setDistressBan } from "@/lib/services/distress.service";

/** Bans / restores a user's distress signal — Admin (audited). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const { disabled } = distressBanSchema.parse(await req.json());
    const res = await setDistressBan(params.id, disabled);
    await audit(req, user.sub, "distress.ban", "user", params.id, { disabled });
    return json(res);
  });
}
