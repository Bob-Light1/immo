import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireAuth, AuthError } from "@/lib/rbac";
import { getFactureLignePdf } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

/**
 * A tenant's personal PDF invoice (their line of a published invoice) — not to
 * be confused with the receipt, which only attests to a payment. A tenant pulls
 * their own (rent invoice in particular); Admin and Bailleur pull anyone's.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    const { pdf, locataireId, filename } = await getFactureLignePdf(params.id);

    const autorise =
      user.role === "admin" || user.role === "bailleur" || user.sub === locataireId;
    if (!autorise) throw new AuthError(403, "Accès refusé à cette facture.");

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
