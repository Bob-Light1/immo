import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { repartirFacture, MAX_RECONDUCTION_STREAK } from "@campusgest/shared";

/**
 * Job reconductions (mensuel) — conception §5.1 / §0.2.
 * Pour chaque type facturé le mois précédent mais pas encore ce mois-ci, crée
 * un brouillon `is_reconducted = true` (non publié) repris de la dernière
 * facture du type, notifie l'Admin pour validation, et incrémente
 * `reconduction_streak`. Au-delà de MAX_RECONDUCTION_STREAK mois consécutifs,
 * une alerte garde-fou est émise (un montant erroné pourrait se propager).
 *
 * Idempotent : un type déjà facturé pour le mois courant est ignoré.
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

  // Factures publiées du mois précédent (les plus récentes par type d'abord).
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
    if (traites.has(src.type)) continue; // une seule reconduction par type
    traites.add(src.type);

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

    // Notifications ciblant le rôle admin (pas un utilisateur nommé).
    publishNotif({ roles: ["admin"] });
  }

  return { created, alerts, skipped };
}
