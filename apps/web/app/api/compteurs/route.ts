import { NextRequest } from "next/server";
import { createCompteurSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createCompteur, listCompteurs } from "@/lib/services/compteur.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Meters available to attach to an invoice, and the management list itself. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    return json(await listCompteurs());
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const input = createCompteurSchema.parse(await req.json());
    const compteur = await createCompteur(input);
    await audit(req, admin.sub, "compteur.create", "compteur", compteur.id, {
      type: input.type,
      libelle: input.libelle,
      scope: input.scope,
    });
    return json(compteur, { status: 201 });
  });
}
