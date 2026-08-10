import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recapFacturesPdf } from "@/lib/pdf";
import { EXPORT_MAX_LIGNES, listLignesExport } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

/** PDF summary statement of published invoices (month filter) — Admin / Bailleur (§6). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const mois = req.nextUrl.searchParams.get("mois") ?? null;

    const { lignes, tronque } = await listLignesExport(mois ?? undefined);

    const rows = lignes.map((l) => ({
      type: l.type,
      mois: l.mois,
      locataire: l.locataire,
      montantDu: l.montantDu,
      montantPaye: l.montantPaye,
      statut: l.statut,
    }));
    const totalFacture = rows.reduce((s, r) => s + r.montantDu, 0);
    const totalEncaisse = rows.reduce((s, r) => s + r.montantPaye, 0);

    // The totals are computed over the lines actually read, so a capped export
    // carries the fact on the document itself: the PDF leaves the application
    // and is read as the period's accounts.
    const pdf = recapFacturesPdf({
      mois,
      genereLe: new Date(),
      totalFacture,
      totalEncaisse,
      lignes: rows,
      tronqueA: tronque ? EXPORT_MAX_LIGNES : null,
    });

    await audit(req, user.sub, "export.recap", "facture", undefined, {
      mois,
      count: rows.length,
      tronque,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // "-partiel" in the filename: the header below is the machine signal,
        // this one survives being saved, mailed or printed.
        "Content-Disposition": `attachment; filename="releve${mois ? "-" + mois : ""}${tronque ? "-partiel" : ""}.pdf"`,
        "Cache-Control": "no-store",
        ...(tronque ? { "X-Export-Tronque": String(EXPORT_MAX_LIGNES) } : {}),
      },
    });
  });
}
