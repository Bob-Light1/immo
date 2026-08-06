import { prisma } from "@/lib/prisma";

/**
 * Admin & Bailleur dashboard data (design §6).
 * All XAF amounts are returned as `number` (serialized through lib/api).
 */

const UNPAID = ["en_attente", "partiel", "retard"] as const;
const DAY_MS = 86_400_000;

/** The last `n` months (YYYY-MM), from the oldest to the current one. */
function moisRange(n: number): string[] {
  const base = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface SeriePoint {
  mois: string;
  facture: number;
  encaisse: number;
}

/** Billed (Σ montantDu) vs collected (Σ montantPaye) per month, published invoices. */
async function serieFactureEncaisse(mois: string[]): Promise<SeriePoint[]> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee", mois: { in: mois } } },
    select: { montantDu: true, montantPaye: true, facture: { select: { mois: true } } },
  });
  const map = new Map<string, SeriePoint>(
    mois.map((m) => [m, { mois: m, facture: 0, encaisse: 0 }]),
  );
  for (const l of lignes) {
    const point = map.get(l.facture.mois);
    if (!point) continue;
    point.facture += Number(l.montantDu);
    point.encaisse += Number(l.montantPaye);
  }
  return mois.map((m) => map.get(m)!);
}

export interface ImpayeRow {
  ligneId: string;
  locataire: string;
  type: string;
  mois: string;
  reste: number;
  joursRetard: number;
  statut: string;
}

/** Unpaid table: published, unsettled lines sorted by due date. */
async function listImpayes(limit = 50): Promise<ImpayeRow[]> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee" }, statut: { in: [...UNPAID] } },
    orderBy: { facture: { dateLimite: "asc" } },
    take: limit,
    include: {
      locataire: { select: { fullName: true } },
      facture: { select: { type: true, mois: true, dateLimite: true } },
    },
  });
  const now = Date.now();
  return lignes
    .map((l) => ({
      ligneId: l.id,
      locataire: l.locataire.fullName,
      type: l.facture.type,
      mois: l.facture.mois,
      reste: Number(l.montantDu) - Number(l.montantPaye),
      joursRetard: Math.max(0, Math.floor((now - new Date(l.facture.dateLimite).getTime()) / DAY_MS)),
      statut: l.statut,
    }))
    .filter((l) => l.reste > 0);
}

/** Billed / collected / rate aggregate for a given month (published invoices). */
async function aggMois(mois: string) {
  const agg = await prisma.factureLocataire.aggregate({
    where: { facture: { statutPub: "publiee", mois } },
    _sum: { montantDu: true, montantPaye: true },
  });
  const facture = Number(agg._sum.montantDu ?? 0);
  const encaisse = Number(agg._sum.montantPaye ?? 0);
  const taux = facture > 0 ? Math.round((encaisse / facture) * 100) : 0;
  return { facture, encaisse, taux };
}

export async function adminDashboard() {
  const mois = moisCourant();
  const [
    locatairesActifs,
    facturesMois,
    impayesRetard,
    ticketsOuverts,
    agg,
    serie,
    modesRaw,
    activiteRaw,
    impayes,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "locataire", isActive: true } }),
    prisma.facture.count({ where: { mois, statutPub: "publiee" } }),
    prisma.factureLocataire.count({ where: { statut: "retard" } }),
    prisma.maintenanceTicket.count({ where: { statut: "ouvert" } }),
    aggMois(mois),
    serieFactureEncaisse(moisRange(12)),
    prisma.paiement.groupBy({ by: ["mode"], _sum: { montant: true } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { fullName: true } } },
    }),
    listImpayes(50),
  ]);

  return {
    role: "admin" as const,
    kpis: {
      locatairesActifs,
      facturesMois,
      tauxPaiement: agg.taux,
      impayesRetard,
      ticketsOuverts,
    },
    serie,
    modes: modesRaw.map((m) => ({ mode: m.mode, total: Number(m._sum.montant ?? 0) })),
    activite: activiteRaw.map((a) => ({
      action: a.action,
      resource: a.resource,
      user: a.user?.fullName ?? null,
      createdAt: a.createdAt,
    })),
    impayes,
  };
}

export async function bailleurDashboard() {
  const mois = moisCourant();
  const [agg, nbImpayes, serie, impayes] = await Promise.all([
    aggMois(mois),
    prisma.factureLocataire.count({
      where: { facture: { statutPub: "publiee", mois }, statut: { in: [...UNPAID] } },
    }),
    serieFactureEncaisse(moisRange(6)),
    listImpayes(50),
  ]);

  return {
    role: "bailleur" as const,
    kpis: {
      totalFactureMois: agg.facture,
      totalEncaisseMois: agg.encaisse,
      tauxRecouvrement: agg.taux,
      nbImpayes,
    },
    serie,
    impayes,
  };
}
