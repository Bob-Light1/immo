import { NextRequest } from "next/server";
import { updateCompteurSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deleteCompteur, updateCompteur } from "@/lib/services/compteur.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Renames, re-scopes or records a new reading on a meter. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const input = updateCompteurSchema.parse(await req.json());
    const compteur = await updateCompteur(params.id, input);
    await audit(req, admin.sub, "compteur.update", "compteur", params.id, input);
    return json(compteur);
  });
}

/** Only ever a meter nothing points at — invoices and rooms hold it in place. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const result = await deleteCompteur(params.id);
    await audit(req, admin.sub, "compteur.delete", "compteur", params.id);
    return json(result);
  });
}
