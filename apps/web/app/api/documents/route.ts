import { NextRequest } from "next/server";
import { documentSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createDocument, listDocuments } from "@/lib/services/document.service";

/** Documents visibles pour mon rôle — tout utilisateur authentifié (§5.15). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(
      await listDocuments(user.role, { page, limit }, user.role === "admin", {
        q: sp.get("q") ?? undefined,
        categorie: sp.get("categorie") ?? undefined,
      }),
    );
  });
}

/** Téléverse un document partagé (fichier obligatoire) — Admin (§5.15). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    const input = documentSchema.parse(await req.json());
    const doc = await createDocument(user.sub, input);
    await audit(req, user.sub, "document.create", "document", doc.id);
    return json(doc, { status: 201 });
  });
}
