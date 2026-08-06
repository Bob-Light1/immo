import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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

    const lignes = await prisma.factureLocataire.findMany({
      where: { facture: { statutPub: "publiee", ...(mois ? { mois } : {}) } },
      orderBy: [{ facture: { mois: "desc" } }, { createdAt: "asc" }],
      include: {
        locataire: { select: { fullName: true } },
        facture: { select: { type: true, mois: true, dateLimite: true } },
      },
    });

    const header = ["Type", "Mois", "Locataire", "Coefficient", "MontantDu", "MontantPaye", "Statut", "DateLimite"];
    const rows = lignes.map((l) => [
      l.facture.type,
      l.facture.mois,
      l.locataire.fullName,
      String(l.coefficient),
      String(l.montantDu),
      String(l.montantPaye),
      l.statut,
      new Date(l.facture.dateLimite).toISOString().slice(0, 10),
    ]);
    // BOM so Excel recognizes UTF-8.
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

    await audit(req, user.sub, "export.factures", "facture", undefined, { mois, count: rows.length });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="factures${mois ? "-" + mois : ""}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
