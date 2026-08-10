import { NextRequest } from "next/server";
import { createFactureSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { createFacture, listFactures } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    const { searchParams } = new URL(req.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    const statut = searchParams.get("statut");
    const result = await listFactures(
      {
        mois: searchParams.get("mois") ?? undefined,
        type: searchParams.get("type") ?? undefined,
        statut: statut === "brouillon" || statut === "publiee" ? statut : undefined,
      },
      pagination,
    );
    return json(result);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("facture", admin.sub);
    const input = createFactureSchema.parse(await req.json());
    const facture = await createFacture(admin.sub, input);
    // Both amount fields are logged: the rent regime carries its figure in
    // `montantParLocataire`, so logging only `montantTotal` left the year's
    // largest invoice with no amount at all in the audit trail.
    await audit(req, admin.sub, "facture.create", "facture", facture.id, {
      type: input.type,
      mois: input.mois,
      montantTotal: input.montantTotal ?? null,
      montantParLocataire: input.montantParLocataire ?? null,
    });
    return json(facture, { status: 201 });
  });
}
