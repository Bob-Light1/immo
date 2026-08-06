import { NextRequest } from "next/server";
import { handle, json, ServiceError } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { getLocataireFactures } from "@/lib/services/facture.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireAuth(req);
    // Un locataire ne consulte que ses propres factures ; admin/bailleur, celles de tous.
    if (auth.role === "locataire" && auth.sub !== params.id) {
      throw new ServiceError(403, "Accès refusé.");
    }
    return json(await getLocataireFactures(params.id));
  });
}
