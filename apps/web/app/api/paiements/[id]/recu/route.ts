import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireAuth, AuthError } from "@/lib/rbac";
import { getRecuPdf } from "@/lib/services/paiement.service";

export const runtime = "nodejs";

/** Télécharge le reçu PDF d'un paiement — Admin, Bailleur ou le locataire concerné (§8.2). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    const { pdf, locataireId, filename } = await getRecuPdf(params.id);

    const autorise =
      user.role === "admin" || user.role === "bailleur" || user.sub === locataireId;
    if (!autorise) throw new AuthError(403, "Accès refusé à ce reçu.");

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
