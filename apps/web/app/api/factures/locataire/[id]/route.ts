import { NextRequest } from "next/server";
import { paginationSchema } from "@campusgest/shared";
import { handle, json, ServiceError } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { getLocataireFactures } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const auth = requireAuth(req);
    // A tenant only reads their own invoices; admin/bailleur read everyone's.
    if (auth.role === "locataire" && auth.sub !== params.id) {
      throw new ServiceError(403, "Accès refusé.", "auth.accesRefuse");
    }
    const { searchParams } = new URL(req.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    return json(await getLocataireFactures(params.id, pagination));
  });
}
