import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { repartirFacture, isLoyer, MAX_RECONDUCTION_STREAK } from "@campusgest/shared";

/**
 * Roll-over job (monthly) — design §5.1 / §0.2.
 * For every type invoiced last month but not yet this month, creates an
 * unpublished `is_reconducted = true` draft copied from the latest invoice of
 * that type, notifies the Admin for validation, and increments
 * `reconduction_streak`. Past MAX_RECONDUCTION_STREAK consecutive months a
 * guard alert is raised (a wrong amount could otherwise propagate silently).
 *
 * Idempotent: a type already invoiced for the current month is skipped.
 */

function moisStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export interface ReconductionsResult {
  created: number;
  alerts: number;
  skipped: number;
}

export async function runReconductions(now: Date = new Date()): Promise<ReconductionsResult> {
  const moisCur = moisStr(now);
  const moisPrec = moisStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const admin = await prisma.user.findFirst({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  if (!admin) return { created: 0, alerts: 0, skipped: 0 };

  // Published invoices from last month (most recent per type first).
  const sources = await prisma.facture.findMany({
    where: { mois: moisPrec, statutPub: "publiee" },
    orderBy: { createdAt: "desc" },
    include: {
      lignes: { include: { locataire: { select: { id: true, isActive: true } } } },
    },
  });

  let created = 0;
  let alerts = 0;
  let skipped = 0;
  const traites = new Set<string>();

  for (const src of sources) {
    if (traites.has(src.type)) continue; // one roll-over per type
    traites.add(src.type);

    // Rent is a flat annual amount: rolling it over monthly would create a
    // second debt for the same year.
    if (isLoyer(src.type)) {
      skipped++;
      continue;
    }

    const existe = await prisma.facture.count({ where: { mois: moisCur, type: src.type } });
    if (existe > 0) {
      skipped++;
      continue;
    }

    const actifs = src.lignes.filter((l) => l.locataire.isActive);
    if (actifs.length === 0) {
      skipped++;
      continue;
    }

    const result = repartirFacture(
      Number(src.montantTotal),
      actifs.map((l) => ({ locataireId: l.locataireId, coefficient: Number(l.coefficient) })),
    );
    const streak = src.reconductionStreak + 1;

    await prisma.facture.create({
      data: {
        type: src.type,
        montantTotal: src.montantTotal,
        mois: moisCur,
        dateLimite: addMonth(new Date(src.dateLimite)),
        compteurId: src.compteurId,
        createdById: admin.id,
        statutPub: "brouillon",
        isReconducted: true,
        reconductionStreak: streak,
        sommeCoeff: result.sommeCoeff,
        baseUnitaire: BigInt(result.baseUnitaire),
        lignes: {
          create: result.lignes.map((l) => ({
            locataireId: l.locataireId,
            coefficient: l.coefficient,
            montantDu: BigInt(l.montantDu),
          })),
        },
      },
    });
    created++;

    await prisma.notification.create({
      data: {
        targetRole: "admin",
        type: "systeme",
        title: `Facture reconduite à valider — ${src.type} ${moisCur}`,
        body: `Un brouillon de la facture ${src.type} a été reconduit depuis ${moisPrec}. Vérifiez le montant puis publiez.`,
      },
    });

    if (streak > MAX_RECONDUCTION_STREAK) {
      await prisma.notification.create({
        data: {
          targetRole: "admin",
          type: "systeme",
          title: `Reconduction répétée — ${src.type}`,
          body: `La facture ${src.type} est reconduite depuis ${streak} mois consécutifs. Confirmez que le montant est toujours correct.`,
        },
      });
      alerts++;
    }

    // Notifications targeting the admin role (not a named user).
    publishNotif({ roles: ["admin"] });
  }

  return { created, alerts, skipped };
}
