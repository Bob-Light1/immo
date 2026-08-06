import { NextRequest } from "next/server";
import { sondageSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createSondage, listSondages } from "@/lib/services/sondage.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Lists the polls with their results — any authenticated user (§5.13). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listSondages(user.sub, { page, limit }));
  });
}

/** Creates a poll — Admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = sondageSchema.parse(await req.json());
    const s = await createSondage(user.sub, input);
    await audit(req, user.sub, "sondage.create", "sondage", s.id);
    return json(s, { status: 201 });
  });
}
