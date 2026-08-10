import { NextRequest } from "next/server";
import { updateFactureSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { rateLimitMutation } from "@/lib/rate-limit";
import { deleteFacture, getFacture, updateFacture } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    return json(await getFacture(params.id));
  });
}

/** Corrects a draft: amount, month, deadline or type (§5.1). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("facture", admin.sub);
    const input = updateFactureSchema.parse(await req.json());
    const facture = await updateFacture(params.id, input);
    await audit(req, admin.sub, "facture.update", "facture", params.id, input);
    return json(facture);
  });
}

/** Deletes a draft. Published invoices are financial history and stay put. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    rateLimitMutation("facture", admin.sub);
    const result = await deleteFacture(params.id);
    await audit(req, admin.sub, "facture.delete", "facture", params.id);
    return json(result);
  });
}
