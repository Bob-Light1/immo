import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recapFacturesPdf } from "@/lib/pdf";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export const runtime = "nodejs";

/** PDF summary statement of published invoices (month filter) — Admin / Bailleur (§6). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const mois = req.nextUrl.searchParams.get("mois") ?? null;

    const lignes = await prisma.factureLocataire.findMany({
      where: { facture: { statutPub: "publiee", ...(mois ? { mois } : {}) } },
      orderBy: [{ facture: { mois: "desc" } }, { createdAt: "asc" }],
      include: {
        locataire: { select: { fullName: true } },
        facture: { select: { type: true, mois: true } },
      },
    });

    const rows = lignes.map((l) => ({
      type: l.facture.type,
      mois: l.facture.mois,
      locataire: l.locataire.fullName,
      montantDu: Number(l.montantDu),
      montantPaye: Number(l.montantPaye),
      statut: l.statut,
    }));
    const totalFacture = rows.reduce((s, r) => s + r.montantDu, 0);
    const totalEncaisse = rows.reduce((s, r) => s + r.montantPaye, 0);

    const pdf = recapFacturesPdf({
      mois,
      genereLe: new Date(),
      totalFacture,
      totalEncaisse,
      lignes: rows,
    });

    await audit(req, user.sub, "export.recap", "facture", undefined, { mois, count: rows.length });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="releve${mois ? "-" + mois : ""}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
