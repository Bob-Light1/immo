import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import {
  repartirFacture,
  type CreateFactureInput,
  type CoefficientsInput,
} from "@campusgest/shared";

/**
 * Crée une facture en brouillon et sa répartition par locataire.
 * - Si `locataireIds` est vide -> tous les locataires actifs.
 * - Coefficient initial = 1 pour chacun (modifiable ensuite).
 */
export async function createFacture(adminId: string, input: CreateFactureInput) {
  const where = {
    role: "locataire" as const,
    isActive: true,
    ...(input.locataireIds?.length ? { id: { in: input.locataireIds } } : {}),
  };
  const locataires = await prisma.user.findMany({ where, select: { id: true } });

  if (locataires.length === 0) {
    throw new ServiceError(400, "Aucun locataire actif à rattacher à la facture.");
  }

  const result = repartirFacture(
    input.montantTotal,
    locataires.map((l) => ({ locataireId: l.id, coefficient: 1 })),
  );

  return prisma.facture.create({
    data: {
      type: input.type,
      montantTotal: BigInt(input.montantTotal),
      mois: input.mois,
      dateLimite: input.dateLimite,
      compteurId: input.compteurId ?? null,
      createdById: adminId,
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
    include: { lignes: true },
  });
}

/** Met à jour les coefficients (facture en brouillon) et recalcule la répartition. */
export async function setCoefficients(factureId: string, input: CoefficientsInput) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { lignes: true },
  });
  if (!facture) throw new ServiceError(404, "Facture introuvable.");
  if (facture.statutPub !== "brouillon") {
    throw new ServiceError(409, "Coefficients non modifiables : facture déjà publiée.");
  }

  const overrides = new Map(input.coefficients.map((c) => [c.locataireId, c.coefficient]));
  const coeffs = facture.lignes.map((l) => ({
    locataireId: l.locataireId,
    coefficient: overrides.get(l.locataireId) ?? Number(l.coefficient),
  }));

  const result = repartirFacture(Number(facture.montantTotal), coeffs);

  await prisma.$transaction([
    prisma.facture.update({
      where: { id: factureId },
      data: { sommeCoeff: result.sommeCoeff, baseUnitaire: BigInt(result.baseUnitaire) },
    }),
    ...result.lignes.map((l) =>
      prisma.factureLocataire.update({
        where: { factureId_locataireId: { factureId, locataireId: l.locataireId } },
        data: { coefficient: l.coefficient, montantDu: BigInt(l.montantDu) },
      }),
    ),
  ]);

  return getFacture(factureId);
}

/**
 * Publie une facture (sort du brouillon). Les notifications seront déclenchées en P2.
 * §5.1 : les locataires désactivés sont exclus du calcul des factures non
 * publiées — on retire leurs lignes et on recalcule avant de figer.
 */
export async function publishFacture(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { lignes: { include: { locataire: { select: { isActive: true } } } } },
  });
  if (!facture) throw new ServiceError(404, "Facture introuvable.");
  if (facture.statutPub === "publiee") {
    throw new ServiceError(409, "Facture déjà publiée.");
  }

  const actives = facture.lignes.filter((l) => l.locataire.isActive);
  const exclues = facture.lignes.filter((l) => !l.locataire.isActive);
  if (actives.length === 0) {
    throw new ServiceError(409, "Aucun locataire actif sur cette facture.");
  }

  if (exclues.length > 0) {
    const result = repartirFacture(
      Number(facture.montantTotal),
      actives.map((l) => ({ locataireId: l.locataireId, coefficient: Number(l.coefficient) })),
    );
    await prisma.$transaction([
      prisma.factureLocataire.deleteMany({ where: { id: { in: exclues.map((l) => l.id) } } }),
      ...result.lignes.map((l) =>
        prisma.factureLocataire.update({
          where: { factureId_locataireId: { factureId, locataireId: l.locataireId } },
          data: { montantDu: BigInt(l.montantDu) },
        }),
      ),
      prisma.facture.update({
        where: { id: factureId },
        data: {
          sommeCoeff: result.sommeCoeff,
          baseUnitaire: BigInt(result.baseUnitaire),
          statutPub: "publiee",
        },
      }),
    ]);
  } else {
    await prisma.facture.update({ where: { id: factureId }, data: { statutPub: "publiee" } });
  }

  return getFacture(factureId);
}

export async function getFacture(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: {
      lignes: {
        orderBy: { createdAt: "asc" },
        include: {
          locataire: { select: { id: true, fullName: true } },
          paiements: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              montant: true,
              mode: true,
              reference: true,
              justificatifUrl: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!facture) throw new ServiceError(404, "Facture introuvable.");
  return facture;
}

export async function listFactures(
  filters: { mois?: string; type?: string; statut?: "brouillon" | "publiee" },
  pagination: { page: number; limit: number },
) {
  const where = {
    ...(filters.mois ? { mois: filters.mois } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.statut ? { statutPub: filters.statut } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.facture.count({ where }),
    prisma.facture.findMany({
      where,
      orderBy: [{ mois: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { lignes: true } } },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

/** Factures d'un locataire (publiées uniquement). */
export async function getLocataireFactures(locataireId: string) {
  return prisma.factureLocataire.findMany({
    where: { locataireId, facture: { statutPub: "publiee" } },
    orderBy: { facture: { mois: "desc" } },
    include: {
      facture: {
        select: { id: true, type: true, mois: true, dateLimite: true, montantTotal: true },
      },
      paiements: {
        orderBy: { createdAt: "desc" },
        select: { id: true, montant: true, mode: true, createdAt: true },
      },
    },
  });
}
