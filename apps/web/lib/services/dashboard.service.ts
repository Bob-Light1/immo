import { prisma } from "@/lib/prisma";
import { anneeDe, moisCourant, moisDe } from "@campusgest/shared";

/**
 * Admin & Bailleur dashboard data (design §6).
 * All XAF amounts are returned as `number` (serialized through lib/api).
 *
 * Monthly figures cover charges only. Rent is a flat *annual* amount filed
 * under a single month: counting it there dropped the collection rate of that
 * month to a fraction of reality and left a lone spike in the 12-month series,
 * which made both dashboards unreadable exactly when rent went out. It gets its
 * own yearly block instead (`loyer`).
 */

const UNPAID = ["en_attente", "partiel", "retard"] as const;
const DAY_MS = 86_400_000;
const HORS_LOYER = { typeKey: { not: "loyer" } };

/** The last `n` months (YYYY-MM), from the oldest to the current one. */
function moisRange(n: number): string[] {
  const base = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(moisDe(new Date(base.getFullYear(), base.getMonth() - i, 1)));
  }
  return out;
}

export interface SeriePoint {
  mois: string;
  facture: number;
  encaisse: number;
}

/** Billed (Σ montantDu) vs collected (Σ montantPaye) per month, charges only. */
async function serieFactureEncaisse(mois: string[]): Promise<SeriePoint[]> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee", mois: { in: mois }, ...HORS_LOYER } },
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
  /** Rent: an open balance here is an annual one, not a missed monthly bill. */
  loyer: boolean;
}

/** Unpaid table: published, unsettled lines sorted by due date. */
async function listImpayes(limit = 50): Promise<ImpayeRow[]> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee" }, statut: { in: [...UNPAID] } },
    orderBy: { facture: { dateLimite: "asc" } },
    take: limit,
    include: {
      locataire: { select: { fullName: true } },
      facture: { select: { type: true, typeKey: true, mois: true, dateLimite: true } },
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
      loyer: l.facture.typeKey === "loyer",
    }))
    .filter((l) => l.reste > 0);
}

/** Billed / collected / rate aggregate for a given month — charges only. */
async function aggMois(mois: string) {
  const agg = await prisma.factureLocataire.aggregate({
    where: { facture: { statutPub: "publiee", mois, ...HORS_LOYER } },
    _sum: { montantDu: true, montantPaye: true },
  });
  const facture = Number(agg._sum.montantDu ?? 0);
  const encaisse = Number(agg._sum.montantPaye ?? 0);
  const taux = facture > 0 ? Math.round((encaisse / facture) * 100) : 0;
  return { facture, encaisse, taux };
}

export interface LoyerAnnuel {
  annee: string;
  facture: number;
  encaisse: number;
  taux: number;
}

/**
 * Rent for the running year, reported on its own scale. `null` when no rent
 * invoice has been published for the year, so the dashboards can leave the
 * block out entirely rather than show a row of zeros.
 */
async function aggLoyerAnnuel(annee: string): Promise<LoyerAnnuel | null> {
  const agg = await prisma.factureLocataire.aggregate({
    where: {
      facture: { statutPub: "publiee", typeKey: "loyer", mois: { startsWith: annee } },
    },
    _sum: { montantDu: true, montantPaye: true },
  });
  const facture = Number(agg._sum.montantDu ?? 0);
  if (facture === 0) return null;
  const encaisse = Number(agg._sum.montantPaye ?? 0);
  return { annee, facture, encaisse, taux: Math.round((encaisse / facture) * 100) };
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
    loyer,
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
    aggLoyerAnnuel(anneeDe(mois)),
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
    loyer,
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
  const [agg, nbImpayes, serie, loyer, impayes] = await Promise.all([
    aggMois(mois),
    prisma.factureLocataire.count({
      where: {
        facture: { statutPub: "publiee", mois, ...HORS_LOYER },
        statut: { in: [...UNPAID] },
      },
    }),
    serieFactureEncaisse(moisRange(6)),
    aggLoyerAnnuel(anneeDe(mois)),
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
    loyer,
    impayes,
  };
}
