import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { EXPORT_MAX_LIGNES, listLignesExport } from "@/lib/services/facture.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV export of published invoice lines (month filter) — Admin / Bailleur (§6). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const mois = req.nextUrl.searchParams.get("mois") ?? undefined;

    const { lignes, tronque } = await listLignesExport(mois);

    const header = ["Type", "Mois", "Locataire", "Coefficient", "MontantDu", "MontantPaye", "Statut", "DateLimite"];
    const rows = lignes.map((l) => [
      l.type,
      l.mois,
      l.locataire,
      String(l.coefficient),
      String(l.montantDu),
      String(l.montantPaye),
      l.statut,
      l.dateLimite,
    ]);
    // BOM so Excel recognizes UTF-8.
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

    await audit(req, user.sub, "export.factures", "facture", undefined, {
      mois,
      count: rows.length,
      tronque,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // The CSV body stays parsable — no banner row — so a capped export is
        // flagged in the filename instead, which survives being saved or sent
        // on, unlike the header below.
        "Content-Disposition": `attachment; filename="factures${mois ? "-" + mois : ""}${tronque ? "-partiel" : ""}.csv"`,
        "Cache-Control": "no-store",
        // Signals a capped export so the caller knows to narrow by month
        // rather than trust an incomplete file.
        ...(tronque ? { "X-Export-Tronque": String(EXPORT_MAX_LIGNES) } : {}),
      },
    });
  });
}
