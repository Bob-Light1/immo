import { NextRequest } from "next/server";
import { evenementSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createEvenement, listEvenements } from "@/lib/services/evenement.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Lists the events (status visible to all) — §5.5. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listEvenements({ page, limit }));
  });
}

/** Proposes an event — any authenticated user. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = evenementSchema.parse(await req.json());
    const ev = await createEvenement(user.sub, input);
    await audit(req, user.sub, "evenement.create", "evenement", ev.id);
    return json(ev, { status: 201 });
  });
}
