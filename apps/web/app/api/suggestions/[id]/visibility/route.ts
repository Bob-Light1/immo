import { NextRequest } from "next/server";
import { suggestionVisibilitySchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { setSuggestionVisibility } from "@/lib/services/suggestion.service";

/** Toggles a suggestion's Bailleur visibility — Admin (§5.4). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const { bailleurVisible } = suggestionVisibilitySchema.parse(await req.json());
    const res = await setSuggestionVisibility(params.id, bailleurVisible);
    await audit(req, user.sub, "suggestion.visibility", "suggestion", params.id, {
      bailleurVisible,
    });
    return json(res);
  });
}
