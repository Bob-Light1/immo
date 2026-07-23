import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { listMySuggestions } from "@/lib/services/suggestion.service";

/** Mes suggestions (sans exposer qui les consulte). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await listMySuggestions(user.sub));
  });
}
