import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { listMySuggestions } from "@/lib/services/suggestion.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** My suggestions (without exposing who reads them). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await listMySuggestions(user.sub));
  });
}
