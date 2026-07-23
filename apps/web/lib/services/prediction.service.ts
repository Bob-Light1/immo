import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { estimerCharge, type PredictionInput } from "@campusgest/shared";
import { notifyAllActive } from "@/lib/services/notification.service";

/**
 * Prédiction / estimation de charge par type (conception §5.11). L'Admin saisit
 * les paramètres ; le système calcule l'estimation, la publie à tous pour
 * anticipation, et compare a posteriori estimé vs réel (`montant_reel`).
 */

const big = (n: number | undefined) => (n != null ? BigInt(n) : null);

export async function createPrediction(adminId: string, input: PredictionInput) {
  const montant = estimerCharge({
    indiceDiff: input.indiceDiff,
    prixUnit: input.prixUnit,
    tva: input.tva,
    locCompteur: input.locCompteur,
    transport: input.transport,
  });

  const prediction = await prisma.predictionFacture.create({
    data: {
      mois: input.mois,
      type: input.type,
      indiceDiff: big(input.indiceDiff),
      prixUnit: big(input.prixUnit),
      tva: big(input.tva),
      locCompteur: big(input.locCompteur),
      transport: big(input.transport),
      montantCalcule: BigInt(montant),
      createdById: adminId,
    },
  });

  await notifyAllActive(
    "prediction",
    `Estimation ${input.type} — ${input.mois}`,
    `Estimation publiée : ${montant.toLocaleString("fr-FR")} XAF, pour anticiper la charge du mois.`,
  );

  return prediction;
}

export async function listPredictions(pagination: { page: number; limit: number }) {
  const [total, items] = await prisma.$transaction([
    prisma.predictionFacture.count(),
    prisma.predictionFacture.findMany({
      orderBy: [{ mois: "desc" }, { createdAt: "desc" }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function setMontantReel(id: string, montantReel: number) {
  const p = await prisma.predictionFacture.findUnique({ where: { id } });
  if (!p) throw new ServiceError(404, "Estimation introuvable.");
  await prisma.predictionFacture.update({
    where: { id },
    data: { montantReel: BigInt(montantReel) },
  });
  return { ok: true };
}
