import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { notifRow } from "../notify";
import {
  repartirFacture,
  isLoyer,
  moisDe,
  moisDecale,
  normalizeFactureType,
  MAX_RECONDUCTION_STREAK,
} from "@campusgest/shared";

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

/**
 * The source deadline shifted one month on.
 *
 * Read and rebuilt in the UTC frame, which is how `@db.Date` columns are stored
 * and read: local components landed on the previous day west of Greenwich. The
 * day is clamped to the target month's length, so a deadline on the 31st moves
 * to the 28th or 30th instead of overflowing into the month after — a January
 * deadline used to roll over to 3 March.
 */
function moisSuivant(d: Date): Date {
  const annee = d.getUTCFullYear();
  const mois = d.getUTCMonth() + 1;
  const dernierJour = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(annee, mois, Math.min(d.getUTCDate(), dernierJour)));
}

export interface ReconductionsResult {
  created: number;
  alerts: number;
  skipped: number;
}

export async function runReconductions(now: Date = new Date()): Promise<ReconductionsResult> {
  const moisCur = moisDe(now);
  const moisPrec = moisDecale(moisCur, -1);

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
    // Folded key: comparing raw labels made "Eau" and "eau" two types, so the
    // same charge could be rolled over twice in one month.
    if (traites.has(src.typeKey)) continue; // one roll-over per type
    traites.add(src.typeKey);

    // Rent is a flat annual amount: rolling it over monthly would create a
    // second debt for the same year.
    if (isLoyer(src.type)) {
      skipped++;
      continue;
    }

    const existe = await prisma.facture.count({
      where: { mois: moisCur, typeKey: src.typeKey },
    });
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
        typeKey: normalizeFactureType(src.type),
        montantTotal: src.montantTotal,
        mois: moisCur,
        dateLimite: moisSuivant(new Date(src.dateLimite)),
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

    // Role-targeted rows: no named recipient, so no push and no per-user
    // language — they are rendered from the key when each admin reads them.
    await prisma.notification.create({
      data: {
        targetRole: "admin",
        type: "systeme",
        ...notifRow("reconduction.brouillon", {
          type: src.type,
          mois: moisCur,
          moisPrecedent: moisPrec,
        }),
      },
    });

    if (streak > MAX_RECONDUCTION_STREAK) {
      await prisma.notification.create({
        data: {
          targetRole: "admin",
          type: "systeme",
          ...notifRow("reconduction.repetee", { type: src.type, streak }),
        },
      });
      alerts++;
    }

    // Notifications targeting the admin role (not a named user).
    publishNotif({ roles: ["admin"] });
  }

  return { created, alerts, skipped };
}
