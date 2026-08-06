import { NextRequest } from "next/server";
import { annonceSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { listNotifications, createAnnonce } from "@/lib/services/notification.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listNotifications(user.sub, user.role, { page, limit }));
  });
}

/** Announcement broadcast to all (or to one role) — Admin / Bailleur (§5.3). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const input = annonceSchema.parse(await req.json());
    const res = await createAnnonce(user.sub, input);
    await audit(req, user.sub, "notification.annonce", "notification", undefined, {
      scope: input.scope,
      sent: res.sent,
    });
    return json(res, { status: 201 });
  });
}
