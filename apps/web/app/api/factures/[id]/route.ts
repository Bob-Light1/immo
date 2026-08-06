import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { getFacture } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireRole(req, "admin", "bailleur");
    return json(await getFacture(params.id));
  });
}
