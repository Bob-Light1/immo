import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { markSuggestionRead } from "@/lib/services/suggestion.service";

/** Marks a suggestion read by the Admin → notifies the author (§5.4). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireRole(req, "admin");
    return json(await markSuggestionRead(params.id));
  });
}
