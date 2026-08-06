import { NextRequest } from "next/server";
import { distressSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendDistress, listDistress } from "@/lib/services/distress.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Emits a distress signal — any user (unless banned) (§5.8). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = distressSchema.parse(await req.json().catch(() => ({})));
    const res = await sendDistress(user.sub, input);
    await audit(req, user.sub, "distress.signal", "distress_signal", res.id, {
      review: res.review,
      geo: input.geoConsent,
    });
    return json(res, { status: 201 });
  });
}

/** Lists the signals (tracking & arbitration) — Admin. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireRole(req, "admin");
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listDistress({ page, limit }));
  });
}
