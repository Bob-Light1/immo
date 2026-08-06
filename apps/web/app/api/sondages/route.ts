import { NextRequest } from "next/server";
import { sondageSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createSondage, listSondages } from "@/lib/services/sondage.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Liste des sondages avec résultats — tout utilisateur authentifié (§5.13). */
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

/** Crée un sondage — Admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = sondageSchema.parse(await req.json());
    const s = await createSondage(user.sub, input);
    await audit(req, user.sub, "sondage.create", "sondage", s.id);
    return json(s, { status: 201 });
  });
}
