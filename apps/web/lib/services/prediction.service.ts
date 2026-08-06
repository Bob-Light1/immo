import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { estimerCharge, partEstimee, type PredictionInput } from "@campusgest/shared";
import { notifyAllActive } from "@/lib/services/notification.service";

/**
 * Charge prediction / estimate per type (design §5.11). The Admin enters the
 * parameters; the system computes the estimate, publishes it to everyone for
 * planning, and later compares estimated vs actual (`montant_reel`).
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

  // The individual share is announced in the notification itself: that is what
  // lets a tenant plan the coming month's payment.
  const nbLocataires = await prisma.user.count({
    where: { role: "locataire", isActive: true },
  });
  const part = partEstimee(montant, nbLocataires);
  const detailPart = part != null ? ` Part estimée par locataire : ${part.toLocaleString("fr-FR")} XAF.` : "";

  await notifyAllActive(
    "prediction",
    `Estimation ${input.type} — ${input.mois}`,
    `Estimation publiée : ${montant.toLocaleString("fr-FR")} XAF au total.${detailPart} Pour anticiper la charge du mois.`,
  );

  return prediction;
}

/**
 * Lists the estimates. An estimated amount covers the whole residence, so the
 * individual share (split evenly across active tenants) is attached to it, so
 * that everyone knows what they will personally owe and can plan for it in
 * advance.
 */
export async function listPredictions(pagination: { page: number; limit: number }) {
  const [total, items, nbLocataires] = await prisma.$transaction([
    prisma.predictionFacture.count(),
    prisma.predictionFacture.findMany({
      orderBy: [{ mois: "desc" }, { createdAt: "desc" }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.user.count({ where: { role: "locataire", isActive: true } }),
  ]);

  return {
    items: items.map((p) => ({
      ...p,
      partEstimee: partEstimee(Number(p.montantCalcule), nbLocataires),
      partReelle: p.montantReel != null ? partEstimee(Number(p.montantReel), nbLocataires) : null,
    })),
    nbLocataires,
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
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
