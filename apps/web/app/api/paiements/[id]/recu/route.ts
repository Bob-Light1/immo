import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { getRecuPdf } from "@/lib/services/paiement.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

/** Downloads a payment's PDF receipt — Admin, Bailleur or the tenant (§8.2). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    // Access is settled inside the service, before the PDF is rendered.
    const user = requireAuth(req);
    const { pdf, filename } = await getRecuPdf(params.id, user);

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
