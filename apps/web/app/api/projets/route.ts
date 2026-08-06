import { NextRequest } from "next/server";
import { projetSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createProjet, listProjets } from "@/lib/services/projet.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Projects visible to my role — any authenticated user (§5.10). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listProjets(user.role, { page, limit }));
  });
}

/** Publishes a shared project — Admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = projetSchema.parse(await req.json());
    const p = await createProjet(user.sub, input);
    await audit(req, user.sub, "projet.create", "projet_commun", p.id);
    return json(p, { status: 201 });
  });
}
