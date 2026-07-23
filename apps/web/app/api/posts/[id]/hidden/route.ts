import { NextRequest } from "next/server";
import { postHiddenSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setPostHidden } from "@/lib/services/post.service";

/** Masque / réaffiche un post (modération) — Admin (§5.9). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const { isHidden } = postHiddenSchema.parse(await req.json());
    const post = await setPostHidden(params.id, isHidden);
    await audit(req, user.sub, "post.hidden", "post_info", params.id, { isHidden });
    return json(post);
  });
}
