import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { searchAnnuaire } from "@/lib/services/portfolio.service";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Annuaire des résidents : recherche par compétence/diplôme (§5.14). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const skill = sp.get("skill") ?? undefined;
    const dispoOnly = sp.get("dispo") === "1";
    return json(await searchAnnuaire(skill, dispoOnly));
  });
}
