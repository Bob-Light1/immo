import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import {
  estimerCharge,
  partEstimee,
  normalizeFactureType,
  type PredictionInput,
} from "@campusgest/shared";
import { notifyEach } from "@/lib/services/notification.service";

/**
 * Charge prediction / estimate per type (design §5.11). The Admin enters the
 * parameters; the system computes the estimate, publishes it to everyone for
 * planning, and later compares estimated vs actual (`montant_reel`).
 */

const big = (n: number | undefined) => (n != null ? BigInt(n) : null);

const xaf = (n: number) => `${n.toLocaleString("fr-FR")} XAF`;

/**
 * The coefficients a real invoice of this type would be split by: those of the
 * most recent published invoice of the same type, falling back to 1 per active
 * tenant (which is how a new invoice starts out).
 *
 * An estimate announced as an even split misled every tenant whose coefficient
 * is not 1 — someone billed at coefficient 2 was shown half of what they were
 * about to owe, which is the opposite of planning ahead.
 */
async function coefficientsProbables(type: string) {
  const derniere = await prisma.facture.findFirst({
    where: { typeKey: normalizeFactureType(type), statutPub: "publiee" },
    orderBy: [{ mois: "desc" }, { createdAt: "desc" }],
    include: {
      lignes: {
        orderBy: { locataireId: "asc" },
        include: { locataire: { select: { id: true, isActive: true } } },
      },
    },
  });

  const actives = derniere?.lignes.filter((l) => l.locataire.isActive) ?? [];
  if (actives.length > 0) {
    return actives.map((l) => ({
      locataireId: l.locataireId,
      coefficient: Number(l.coefficient),
    }));
  }

  const locataires = await prisma.user.findMany({
    where: { role: "locataire", isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return locataires.map((l) => ({ locataireId: l.id, coefficient: 1 }));
}

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
  // lets a tenant plan the coming month's payment — so it has to be *their*
  // share, computed on their own coefficient.
  const coeffs = await coefficientsProbables(input.type);
  const sommeCoeff = coeffs.reduce((s, c) => s + c.coefficient, 0);

  await notifyEach(
    coeffs.map((c) => {
      const part = partEstimee(montant, sommeCoeff, c.coefficient);
      return {
        userId: c.locataireId,
        key: "prediction.publiee" as const,
        params: {
          type: input.type,
          mois: input.mois,
          montant,
          part: part != null ? "yes" : "no",
          partMontant: part ?? 0,
        },
      };
    }),
    "prediction",
  );

  // Admin and Bailleur follow the total, not an individual share.
  const gestionnaires = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["admin", "bailleur"] } },
    select: { id: true },
  });
  await notifyEach(
    gestionnaires.map((u) => ({
      userId: u.id,
      key: "prediction.publiee" as const,
      params: { type: input.type, mois: input.mois, montant, part: "no", partMontant: 0 },
    })),
    "prediction",
  );

  return prediction;
}

/**
 * Lists the estimates. An estimated amount covers the whole residence, so the
 * share for a coefficient of 1 is attached to it — the reference figure a
 * tenant scales by their own coefficient.
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

  // One lookup per distinct type rather than per row.
  const sommes = new Map<string, number>();
  for (const type of new Set(items.map((p) => p.type))) {
    const coeffs = await coefficientsProbables(type);
    sommes.set(
      type,
      coeffs.reduce((s, c) => s + c.coefficient, 0),
    );
  }

  return {
    items: items.map((p) => {
      const sommeCoeff = sommes.get(p.type) ?? nbLocataires;
      return {
        ...p,
        sommeCoeff,
        partEstimee: partEstimee(Number(p.montantCalcule), sommeCoeff),
        partReelle:
          p.montantReel != null ? partEstimee(Number(p.montantReel), sommeCoeff) : null,
      };
    }),
    nbLocataires,
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

export async function setMontantReel(id: string, montantReel: number) {
  const p = await prisma.predictionFacture.findUnique({ where: { id } });
  if (!p) throw new ServiceError(404, "Estimation introuvable.", "introuvable.prediction");
  await prisma.predictionFacture.update({
    where: { id },
    data: { montantReel: BigInt(montantReel) },
  });
  return { ok: true };
}
