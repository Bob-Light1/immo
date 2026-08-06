import { NextRequest } from "next/server";
import { suggestionSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createSuggestion, listSuggestions } from "@/lib/services/suggestion.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Liste de gestion — Admin (toutes) / Bailleur (visibles uniquement). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listSuggestions(user.role, { page, limit }));
  });
}

/** Soumission d'une suggestion — tout utilisateur authentifié. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = suggestionSchema.parse(await req.json());
    const s = await createSuggestion(user.sub, input.contenu);
    await audit(req, user.sub, "suggestion.create", "suggestion", s.id);
    return json({ id: s.id, ordre: s.ordre, createdAt: s.createdAt }, { status: 201 });
  });
}
