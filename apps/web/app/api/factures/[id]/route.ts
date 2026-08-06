import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { getFacture } from "@/lib/services/facture.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    return json(await getFacture(params.id));
  });
}
