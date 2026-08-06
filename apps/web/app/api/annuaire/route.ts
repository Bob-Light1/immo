import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { searchAnnuaire } from "@/lib/services/portfolio.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Resident directory: search by skill/degree (§5.14). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const skill = sp.get("skill") ?? undefined;
    const dispoOnly = sp.get("dispo") === "1";
    return json(await searchAnnuaire(skill, dispoOnly));
  });
}
