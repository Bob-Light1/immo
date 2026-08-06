import { NextRequest } from "next/server";
import { projetSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createProjet, listProjets } from "@/lib/services/projet.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Projets visibles pour mon rôle — tout utilisateur authentifié (§5.10). */
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

/** Publie un projet commun — Admin. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = projetSchema.parse(await req.json());
    const p = await createProjet(user.sub, input);
    await audit(req, user.sub, "projet.create", "projet_commun", p.id);
    return json(p, { status: 201 });
  });
}
