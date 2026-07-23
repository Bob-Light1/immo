import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { publishFacture } from "@/lib/services/facture.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const facture = await publishFacture(params.id);
    await audit(req, admin.sub, "facture.publish", "facture", params.id);
    return json(facture);
  });
}
