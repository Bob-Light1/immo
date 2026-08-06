import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { factureLocatairePdf, type FactureLigneData } from "@/lib/pdf";
import {
  repartirFacture,
  isLoyer,
  suiviLoyer,
  type CreateFactureInput,
  type CoefficientsInput,
} from "@campusgest/shared";

/**
 * Creates a draft invoice and its per-tenant split.
 * - When `locataireIds` is empty -> every active tenant.
 * - Initial coefficient = 1 for each of them (editable afterwards).
 *
 * "Loyer" regime: no split. The Admin enters the annual amount owed by each
 * tenant (`montantParLocataire`); every line carries that flat amount and the
 * invoice total is merely their sum.
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

  const loyer = isLoyer(input.type);
  if (loyer && input.montantParLocataire == null) {
    throw new ServiceError(
      400,
      "Facture de loyer : renseignez le montant annuel dû par chaque locataire.",
    );
  }
  if (!loyer && input.montantParLocataire != null) {
    throw new ServiceError(
      400,
      "Le montant par locataire est réservé au loyer ; les autres factures se répartissent à partir d'un montant total.",
    );
  }

  const repartition = loyer
    ? {
        sommeCoeff: locataires.length,
        baseUnitaire: input.montantParLocataire!,
        lignes: locataires.map((l) => ({
          locataireId: l.id,
          coefficient: 1,
          montantDu: input.montantParLocataire!,
        })),
      }
    : repartirFacture(
        input.montantTotal!,
        locataires.map((l) => ({ locataireId: l.id, coefficient: 1 })),
      );

  const montantTotal = repartition.lignes.reduce((s, l) => s + l.montantDu, 0);

  return prisma.facture.create({
    data: {
      type: input.type,
      montantTotal: BigInt(montantTotal),
      mois: input.mois,
      dateLimite: input.dateLimite,
      compteurId: input.compteurId ?? null,
      createdById: adminId,
      sommeCoeff: repartition.sommeCoeff,
      // Rent: the "base" is the flat annual amount per tenant.
      baseUnitaire: BigInt(repartition.baseUnitaire),
      lignes: {
        create: repartition.lignes.map((l) => ({
          locataireId: l.locataireId,
          coefficient: l.coefficient,
          montantDu: BigInt(l.montantDu),
        })),
      },
    },
    include: { lignes: true },
  });
}

/** Updates the coefficients (draft invoice) and recomputes the split. */
export async function setCoefficients(factureId: string, input: CoefficientsInput) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { lignes: true },
  });
  if (!facture) throw new ServiceError(404, "Facture introuvable.");
  if (facture.statutPub !== "brouillon") {
    throw new ServiceError(409, "Coefficients non modifiables : facture déjà publiée.");
  }
  if (isLoyer(facture.type)) {
    throw new ServiceError(
      409,
      "Facture de loyer : forfait annuel identique par locataire, sans division ni coefficient.",
    );
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
 * Publishes an invoice (leaves draft state). Notifications will be wired in P2.
 * §5.1: deactivated tenants are excluded from unpublished invoices — their
 * lines are removed and the split recomputed before freezing.
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

  // Rent: removing an inactive tenant redistributes nothing — each annual flat
  // amount stays intact, only the invoice total goes down.
  if (exclues.length > 0 && isLoyer(facture.type)) {
    const montantTotal = actives.reduce((s, l) => s + l.montantDu, 0n);
    await prisma.$transaction([
      prisma.factureLocataire.deleteMany({ where: { id: { in: exclues.map((l) => l.id) } } }),
      prisma.facture.update({
        where: { id: factureId },
        data: { montantTotal, sommeCoeff: actives.length, statutPub: "publiee" },
      }),
    ]);
  } else if (exclues.length > 0) {
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

/** A tenant's invoices (published only). */
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

/**
 * A tenant's PDF invoice (their line of a published invoice) — not to be
 * confused with the receipt, which only attests to a payment. For rent, the
 * document carries the annual tracking: paid this month, paid year to date,
 * still due. Returns `locataireId` for the route-level access check.
 */
export async function getFactureLignePdf(
  ligneId: string,
): Promise<{ pdf: Buffer; locataireId: string; filename: string }> {
  const ligne = await prisma.factureLocataire.findUnique({
    where: { id: ligneId },
    include: {
      locataire: { select: { id: true, fullName: true } },
      facture: { select: { type: true, mois: true, dateLimite: true, statutPub: true, montantTotal: true } },
      paiements: {
        orderBy: { createdAt: "asc" },
        select: { montant: true, mode: true, reference: true, createdAt: true },
      },
    },
  });
  if (!ligne) throw new ServiceError(404, "Ligne de facture introuvable.");
  if (ligne.facture.statutPub !== "publiee") {
    throw new ServiceError(409, "Facture non publiée : document indisponible.");
  }

  const loyer = isLoyer(ligne.facture.type);
  const montantDu = Number(ligne.montantDu);
  const montantPaye = Number(ligne.montantPaye);
  const paiements = ligne.paiements.map((p) => ({
    montant: Number(p.montant),
    mode: p.mode as string,
    reference: p.reference,
    date: p.createdAt,
  }));

  const data: FactureLigneData = {
    ligneId: ligne.id,
    genereLe: new Date(),
    locataire: ligne.locataire.fullName,
    type: ligne.facture.type,
    mois: ligne.facture.mois,
    dateLimite: ligne.facture.dateLimite,
    coefficient: Number(ligne.coefficient),
    montantTotalFacture: Number(ligne.facture.montantTotal),
    montantDu,
    montantPaye,
    loyer,
    suivi: loyer
      ? suiviLoyer({ montantAnnuel: montantDu, montantPaye, paiements })
      : null,
    paiements,
  };

  return {
    pdf: factureLocatairePdf(data),
    locataireId: ligne.locataire.id,
    filename: `facture-${ligne.facture.type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ligne.facture.mois}.pdf`,
  };
}
