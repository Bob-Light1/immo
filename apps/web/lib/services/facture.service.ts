import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { factureLocatairePdf, type FactureLigneData } from "@/lib/pdf";
import { notifyEach } from "@/lib/services/notification.service";
import {
  repartirFacture,
  isLoyer,
  normalizeFactureType,
  suiviLoyer,
  anneeDe,
  dateLimiteCoherente,
  dateLimiteLoyerCoherente,
  LOYER_ECHEANCE_MIN_MOIS,
  type CreateFactureInput,
  type UpdateFactureInput,
  type CoefficientsInput,
  type Role,
} from "@campusgest/shared";

/**
 * Deterministic line ordering. `repartirFacture` breaks ties on input order, so
 * an unordered read would let the same coefficients hand the rounding unit to a
 * different tenant on every save. Ordering by tenant id (stable, unlike
 * `createdAt` which several lines share to the millisecond) makes the split a
 * pure function of the invoice's contents.
 */
const LIGNE_ORDER = [{ locataireId: "asc" as const }];

/** Tenants attached to an invoice, in the canonical order. */
function coeffEntries(lignes: { locataireId: string; coefficient: Prisma.Decimal | number }[]) {
  return lignes.map((l) => ({
    locataireId: l.locataireId,
    coefficient: Number(l.coefficient),
  }));
}

/**
 * Rent covers a whole calendar year. The (typeKey, mois) uniqueness rule cannot
 * see that "Loyer 2026-01" and "Loyer 2026-08" bill the same year twice, so the
 * year is checked explicitly (a partial unique index backs this up against
 * races — see the migration).
 */
async function assertLoyerAnnuelLibre(mois: string, exceptFactureId?: string) {
  const existant = await prisma.facture.findFirst({
    where: {
      typeKey: "loyer",
      mois: { startsWith: anneeDe(mois) },
      ...(exceptFactureId ? { id: { not: exceptFactureId } } : {}),
    },
    select: { mois: true },
  });
  if (existant) {
    throw new ServiceError(
      409,
      `Une facture de loyer couvre déjà l'année ${anneeDe(mois)} (${existant.mois}). Le loyer est un forfait annuel : corrigez la facture existante plutôt que d'en créer une seconde.`,
      "facture.loyerAnneeOccupee",
      { annee: anneeDe(mois), mois: existant.mois },
    );
  }
}

/** Same type, same month — the residence would be billed twice. */
async function assertTypeMoisLibre(typeKey: string, mois: string, exceptFactureId?: string) {
  const existant = await prisma.facture.findFirst({
    where: { typeKey, mois, ...(exceptFactureId ? { id: { not: exceptFactureId } } : {}) },
    select: { type: true },
  });
  if (existant) {
    throw new ServiceError(
      409,
      `Une facture « ${existant.type} » existe déjà pour ${mois}.`,
      "facture.typeMoisOccupe",
      { type: existant.type, mois },
    );
  }
}

/** An invoice may only point at a compteur that exists (FK errors read as 500). */
async function assertCompteur(compteurId: string | null | undefined) {
  if (!compteurId) return;
  const compteur = await prisma.compteur.findUnique({
    where: { id: compteurId },
    select: { id: true },
  });
  if (!compteur) throw new ServiceError(400, "Compteur introuvable.", "introuvable.compteur");
}

/**
 * Resolves the tenants to attach. Unknown, non-tenant or deactivated ids used
 * to be dropped without a word, so an invoice could quietly go out to fewer
 * people than the Admin selected; they are now reported.
 */
async function resolveLocataires(locataireIds: string[] | undefined) {
  const cible = locataireIds?.length ? locataireIds : undefined;
  const locataires = await prisma.user.findMany({
    where: {
      role: "locataire",
      isActive: true,
      ...(cible ? { id: { in: cible } } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (cible) {
    const trouves = new Set(locataires.map((l) => l.id));
    const manquants = cible.filter((id) => !trouves.has(id));
    if (manquants.length > 0) {
      throw new ServiceError(
        400,
        `${manquants.length} locataire(s) sélectionné(s) sont inconnus ou désactivés ; la facture n'a pas été créée.`,
        "facture.locatairesInconnus",
        { count: manquants.length },
      );
    }
  }
  if (locataires.length === 0) {
    throw new ServiceError(
      400,
      "Aucun locataire actif à rattacher à la facture.",
      "facture.aucunLocataireRattacher",
    );
  }
  return locataires;
}

/** Builds the per-tenant split for either regime. */
function repartition(
  loyer: boolean,
  input: { montantTotal?: number; montantParLocataire?: number },
  locataires: { id: string }[],
) {
  if (loyer) {
    if (input.montantParLocataire == null) {
      throw new ServiceError(
        400,
        "Facture de loyer : renseignez le montant annuel dû par chaque locataire.",
        "facture.loyerMontantAnnuelRequis",
      );
    }
    return {
      sommeCoeff: locataires.length,
      baseUnitaire: input.montantParLocataire,
      lignes: locataires.map((l) => ({
        locataireId: l.id,
        coefficient: 1,
        montantDu: input.montantParLocataire!,
      })),
    };
  }
  if (input.montantTotal == null) {
    throw new ServiceError(
      400,
      "Le montant par locataire est réservé au loyer ; les autres factures se répartissent à partir d'un montant total.",
      "facture.montantParLocataireReserveLoyer",
    );
  }
  return repartirFacture(
    input.montantTotal,
    locataires.map((l) => ({ locataireId: l.id, coefficient: 1 })),
  );
}

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
  const typeKey = normalizeFactureType(input.type);
  const loyer = isLoyer(input.type);

  await assertCompteur(input.compteurId);
  await assertTypeMoisLibre(typeKey, input.mois);
  if (loyer) await assertLoyerAnnuelLibre(input.mois);

  const locataires = await resolveLocataires(input.locataireIds);
  const split = repartition(loyer, input, locataires);
  const montantTotal = split.lignes.reduce((s, l) => s + l.montantDu, 0);

  return prisma.facture.create({
    data: {
      type: input.type,
      typeKey,
      montantTotal: BigInt(montantTotal),
      mois: input.mois,
      dateLimite: input.dateLimite,
      compteurId: input.compteurId ?? null,
      createdById: adminId,
      sommeCoeff: split.sommeCoeff,
      // Rent: the "base" is the flat annual amount per tenant.
      baseUnitaire: BigInt(split.baseUnitaire),
      lignes: {
        create: split.lignes.map((l) => ({
          locataireId: l.locataireId,
          coefficient: l.coefficient,
          montantDu: BigInt(l.montantDu),
        })),
      },
    },
    include: { lignes: { orderBy: LIGNE_ORDER } },
  });
}

/** Loads a draft, refusing anything already published. */
async function loadBrouillon(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { lignes: { orderBy: LIGNE_ORDER } },
  });
  if (!facture) throw new ServiceError(404, "Facture introuvable.", "introuvable.facture");
  if (facture.statutPub !== "brouillon") {
    throw new ServiceError(
      409,
      "Facture déjà publiée : elle n'est plus modifiable.",
      "facture.publieeNonModifiable",
    );
  }
  return facture;
}

/**
 * Corrects a draft (§5.1). A mistyped amount, month or type used to be
 * unfixable — only coefficients could be edited — so the whole invoice had to
 * be lived with. Publication freezes the invoice, hence the draft-only rule;
 * the tenants attached stay as they are (that is what publication settles).
 */
export async function updateFacture(factureId: string, input: UpdateFactureInput) {
  const facture = await loadBrouillon(factureId);

  const type = input.type ?? facture.type;
  const typeKey = normalizeFactureType(type);
  const mois = input.mois ?? facture.mois;
  const dateLimite = input.dateLimite ?? facture.dateLimite;
  const loyer = isLoyer(type);

  if (!dateLimiteCoherente(mois, dateLimite)) {
    throw new ServiceError(
      400,
      "L'échéance ne tombe plus dans la période facturée : ajustez aussi la date limite.",
      "facture.echeanceHorsPeriode",
    );
  }
  // Re-checked here because a draft can become a rent invoice by editing its
  // type alone, leaving a deadline that was legitimate under the other regime.
  if (loyer && !dateLimiteLoyerCoherente(mois, dateLimite)) {
    throw new ServiceError(
      400,
      `Facture de loyer : le forfait couvre une année, l'échéance doit être au moins ${LOYER_ECHEANCE_MIN_MOIS} mois après le début de la période.`,
      "facture.loyerEcheanceTropTot",
      { mois: LOYER_ECHEANCE_MIN_MOIS },
    );
  }
  if (typeKey !== facture.typeKey || mois !== facture.mois) {
    await assertTypeMoisLibre(typeKey, mois, factureId);
  }
  if (loyer) await assertLoyerAnnuelLibre(mois, factureId);

  // The amount field has to match the regime the draft ends up in. The schema
  // cannot enforce this — it does not know the stored type when `type` is left
  // out — and the service used to drop the mismatched field, answering 200 on a
  // figure the Admin believed they had just corrected.
  if (loyer && input.montantTotal != null) {
    throw new ServiceError(
      400,
      "Facture de loyer : le forfait se corrige par le montant annuel dû par chaque locataire, pas par un montant total.",
      "facture.loyerMontantTotalInterdit",
    );
  }
  if (!loyer && input.montantParLocataire != null) {
    throw new ServiceError(
      400,
      "Le montant par locataire est réservé au loyer ; les autres factures se répartissent à partir d'un montant total.",
      "facture.montantParLocataireReserveLoyer",
    );
  }

  // Switching regimes changes what the amount *means* (a total to divide vs a
  // flat amount per tenant), so the matching field must come with the switch
  // rather than have the stored figure silently reinterpreted.
  const changeRegime = loyer !== isLoyer(facture.type);
  if (changeRegime && loyer && input.montantParLocataire == null) {
    throw new ServiceError(
      400,
      "Passage en loyer : indiquez le montant annuel dû par chaque locataire.",
      "facture.loyerEntree",
    );
  }
  if (changeRegime && !loyer && input.montantTotal == null) {
    throw new ServiceError(
      400,
      "Sortie du régime loyer : indiquez le montant total à répartir.",
      "facture.loyerSortie",
    );
  }

  if (input.compteurId !== undefined) await assertCompteur(input.compteurId);

  // Re-resolved (and re-validated) when the Admin restates the roster, so a
  // tenant who arrived after the draft was written can be added instead of the
  // invoice having to be deleted and re-entered. `resolveLocataires` orders by
  // id, like `LIGNE_ORDER`, which keeps the split's tie-breaking stable.
  const locataires = input.locataireIds
    ? await resolveLocataires(input.locataireIds)
    : facture.lignes.map((l) => ({ id: l.locataireId }));

  // Coefficients already set on the draft are preserved; a tenant joining the
  // invoice starts at 1, as at creation.
  const coeffPrecedents = new Map(facture.lignes.map((l) => [l.locataireId, Number(l.coefficient)]));
  const split = loyer
    ? repartition(
        true,
        { montantParLocataire: input.montantParLocataire ?? Number(facture.baseUnitaire) },
        locataires,
      )
    : repartirFacture(
        input.montantTotal ?? Number(facture.montantTotal),
        locataires.map((l) => ({ locataireId: l.id, coefficient: coeffPrecedents.get(l.id) ?? 1 })),
      );
  const montantTotal = split.lignes.reduce((s, l) => s + l.montantDu, 0);

  // Lines dropped from the roster. Safe to delete outright: the invoice is a
  // draft, and a payment presupposes publication.
  const cible = new Set(split.lignes.map((l) => l.locataireId));
  const retirees = facture.lignes.filter((l) => !cible.has(l.locataireId)).map((l) => l.id);

  await prisma.$transaction([
    prisma.facture.update({
      where: { id: factureId, statutPub: "brouillon" },
      data: {
        type,
        typeKey,
        mois,
        dateLimite,
        montantTotal: BigInt(montantTotal),
        sommeCoeff: split.sommeCoeff,
        baseUnitaire: BigInt(split.baseUnitaire),
        ...(input.compteurId !== undefined ? { compteurId: input.compteurId } : {}),
      },
    }),
    ...(retirees.length > 0
      ? [prisma.factureLocataire.deleteMany({ where: { id: { in: retirees } } })]
      : []),
    // Upsert rather than update: the same statement then covers a tenant kept
    // on the invoice and one just added to it.
    ...split.lignes.map((l) =>
      prisma.factureLocataire.upsert({
        where: { factureId_locataireId: { factureId, locataireId: l.locataireId } },
        create: {
          factureId,
          locataireId: l.locataireId,
          coefficient: l.coefficient,
          montantDu: BigInt(l.montantDu),
        },
        update: { coefficient: l.coefficient, montantDu: BigInt(l.montantDu) },
      }),
    ),
  ]);

  return getFacture(factureId);
}

/**
 * Deletes a draft. Only ever a draft: a published invoice is financial history
 * and its lines may already carry payments (cascade would take them too).
 */
export async function deleteFacture(factureId: string) {
  await loadBrouillon(factureId);
  // Guarded on the status again so a publication racing this cannot be undone.
  const { count } = await prisma.facture.deleteMany({
    where: { id: factureId, statutPub: "brouillon" },
  });
  if (count === 0) {
    throw new ServiceError(
      409,
      "Facture déjà publiée : elle n'est plus supprimable.",
      "facture.publieeNonSupprimable",
    );
  }
  return { ok: true };
}

/** Updates the coefficients (draft invoice) and recomputes the split. */
export async function setCoefficients(factureId: string, input: CoefficientsInput) {
  const facture = await loadBrouillon(factureId);
  if (isLoyer(facture.type)) {
    throw new ServiceError(
      409,
      "Facture de loyer : forfait annuel identique par locataire, sans division ni coefficient.",
      "facture.loyerSansCoefficient",
    );
  }

  // A tenant absent from the invoice is a client-side mistake: accepting it
  // silently returned 200 while changing nothing.
  const attaches = new Set(facture.lignes.map((l) => l.locataireId));
  const inconnus = input.coefficients.filter((c) => !attaches.has(c.locataireId));
  if (inconnus.length > 0) {
    throw new ServiceError(
      400,
      `${inconnus.length} locataire(s) ne sont pas rattachés à cette facture.`,
      "facture.locatairesNonRattaches",
      { count: inconnus.length },
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
      where: { id: factureId, statutPub: "brouillon" },
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
 * Tells each tenant what they personally owe, and by when. Publication used to
 * be silent: the first thing a tenant heard was the J-2 reminder from the
 * due-date worker, and nothing at all when the deadline was closer than that.
 */
async function notifierPublication(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { lignes: { orderBy: LIGNE_ORDER } },
  });
  if (!facture) return;

  const loyer = isLoyer(facture.type);
  await notifyEach(
    facture.lignes.map((l) => ({
      userId: l.locataireId,
      key: loyer ? ("facture.publieeLoyer" as const) : ("facture.publiee" as const),
      params: {
        type: facture.type,
        periode: loyer ? anneeDe(facture.mois) : facture.mois,
        montant: Number(l.montantDu),
        echeance: new Date(facture.dateLimite).toISOString(),
      },
    })),
    "alerte_facture",
  );
}

/**
 * Publishes an invoice (leaves draft state).
 * §5.1: deactivated tenants are excluded from unpublished invoices — their
 * lines are removed and the split recomputed before freezing.
 *
 * The whole read-decide-write sequence runs in one transaction and every write
 * is guarded on `statutPub`: two concurrent publications used to both pass the
 * status check, the loser then updating lines the winner had already deleted.
 */
export async function publishFacture(factureId: string) {
  await prisma.$transaction(async (tx) => {
    const facture = await tx.facture.findUnique({
      where: { id: factureId },
      include: {
        lignes: {
          orderBy: LIGNE_ORDER,
          include: { locataire: { select: { isActive: true } } },
        },
      },
    });
    if (!facture) throw new ServiceError(404, "Facture introuvable.", "introuvable.facture");
    if (facture.statutPub === "publiee") {
      throw new ServiceError(409, "Facture déjà publiée.", "facture.dejaPubliee");
    }

    const actives = facture.lignes.filter((l) => l.locataire.isActive);
    const exclues = facture.lignes.filter((l) => !l.locataire.isActive);
    if (actives.length === 0) {
      throw new ServiceError(
        409,
        "Aucun locataire actif sur cette facture.",
        "facture.aucunLocataireActif",
      );
    }

    const data: Prisma.FactureUpdateManyMutationInput = { statutPub: "publiee" };

    if (exclues.length > 0) {
      await tx.factureLocataire.deleteMany({ where: { id: { in: exclues.map((l) => l.id) } } });

      if (isLoyer(facture.type)) {
        // Rent: removing an inactive tenant redistributes nothing — each annual
        // flat amount stays intact, only the invoice total goes down.
        data.montantTotal = actives.reduce((s, l) => s + l.montantDu, 0n);
        data.sommeCoeff = actives.length;
      } else {
        const result = repartirFacture(Number(facture.montantTotal), coeffEntries(actives));
        for (const l of result.lignes) {
          await tx.factureLocataire.update({
            where: { factureId_locataireId: { factureId, locataireId: l.locataireId } },
            data: { montantDu: BigInt(l.montantDu) },
          });
        }
        data.sommeCoeff = result.sommeCoeff;
        data.baseUnitaire = BigInt(result.baseUnitaire);
      }
    }

    const { count } = await tx.facture.updateMany({
      where: { id: factureId, statutPub: "brouillon" },
      data,
    });
    if (count === 0) throw new ServiceError(409, "Facture déjà publiée.", "facture.dejaPubliee");
  });

  // Outside the transaction: a push/SSE hiccup must not roll back a publication
  // that is, from the residence's point of view, already effective. Swallowed
  // for the same reason — letting it through returned a 500 on an invoice that
  // was in fact published, which skipped the caller's audit entry and made the
  // obvious retry answer "already published".
  try {
    await notifierPublication(factureId);
  } catch (e) {
    console.error("[facture.publish] notification", e);
  }

  return getFacture(factureId);
}

export async function getFacture(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: {
      compteur: { select: { id: true, type: true, libelle: true, scope: true } },
      lignes: {
        orderBy: LIGNE_ORDER,
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
  if (!facture) throw new ServiceError(404, "Facture introuvable.", "introuvable.facture");
  return facture;
}

export async function listFactures(
  filters: { mois?: string; type?: string; statut?: "brouillon" | "publiee" },
  pagination: { page: number; limit: number },
) {
  const where = {
    ...(filters.mois ? { mois: filters.mois } : {}),
    // Folded key: filtering on the raw label missed "eau" when "Eau" was typed.
    ...(filters.type ? { typeKey: normalizeFactureType(filters.type) } : {}),
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

const LIGNE_LOCATAIRE_INCLUDE = {
  facture: {
    select: { id: true, type: true, typeKey: true, mois: true, dateLimite: true, montantTotal: true },
  },
  paiements: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, montant: true, mode: true, createdAt: true },
  },
};

/** Rent is one invoice a year: five covers the whole history of a residency. */
const LOYERS_MAX = 5;

export interface SoldeLocataire {
  /** Outstanding on the monthly charges. */
  charges: number;
  /**
   * Outstanding on the annual rent. Reported apart: it is a yearly commitment
   * settled by instalments, not a missed monthly bill, and adding the two into
   * one figure made a tenant paying exactly as agreed look deep in arrears.
   */
  loyer: number;
}

async function soldeLocataire(locataireId: string, loyer: boolean): Promise<number> {
  const agg = await prisma.factureLocataire.aggregate({
    where: {
      locataireId,
      statut: { not: "paye" },
      facture: {
        statutPub: "publiee",
        ...(loyer ? { typeKey: "loyer" } : { typeKey: { not: "loyer" } }),
      },
    },
    _sum: { montantDu: true, montantPaye: true },
  });
  return Number(agg._sum.montantDu ?? 0) - Number(agg._sum.montantPaye ?? 0);
}

/**
 * A tenant's invoices (published only).
 *
 * The charges are paged — the list used to return every line ever published
 * with all its payments, and it is the tenant home page's only fetch, so it grew
 * without bound. The two things a page cannot be allowed to truncate are
 * computed whole: the rent lines, which are yearly and would eventually be
 * pushed off the first page by the monthly stream, and the balance, which is
 * aggregated over everything outstanding rather than over what is displayed.
 */
export async function getLocataireFactures(
  locataireId: string,
  pagination: { page: number; limit: number },
) {
  const where = {
    locataireId,
    facture: { statutPub: "publiee" as const, typeKey: { not: "loyer" } },
  };

  const [total, items, loyers, charges, loyer] = await Promise.all([
    prisma.factureLocataire.count({ where }),
    prisma.factureLocataire.findMany({
      where,
      orderBy: [{ facture: { mois: "desc" } }, { id: "asc" }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: LIGNE_LOCATAIRE_INCLUDE,
    }),
    prisma.factureLocataire.findMany({
      where: { locataireId, facture: { statutPub: "publiee", typeKey: "loyer" } },
      orderBy: { facture: { mois: "desc" } },
      take: LOYERS_MAX,
      include: LIGNE_LOCATAIRE_INCLUDE,
    }),
    soldeLocataire(locataireId, false),
    soldeLocataire(locataireId, true),
  ]);

  return {
    items,
    loyers,
    solde: { charges, loyer } satisfies SoldeLocataire,
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

/** Hard ceiling on an export: without it, an unfiltered request loads every
 *  line ever published into memory to build a CSV or a PDF. */
export const EXPORT_MAX_LIGNES = 5_000;

export interface ExportLigne {
  type: string;
  mois: string;
  locataire: string;
  coefficient: number;
  montantDu: number;
  montantPaye: number;
  statut: string;
  dateLimite: string;
}

/** Published lines for the CSV / PDF statements (§6). */
export async function listLignesExport(mois?: string): Promise<{
  lignes: ExportLigne[];
  tronque: boolean;
}> {
  const where = { facture: { statutPub: "publiee" as const, ...(mois ? { mois } : {}) } };
  const [total, rows] = await prisma.$transaction([
    prisma.factureLocataire.count({ where }),
    prisma.factureLocataire.findMany({
      where,
      orderBy: [{ facture: { mois: "desc" } }, { locataireId: "asc" }],
      take: EXPORT_MAX_LIGNES,
      include: {
        locataire: { select: { fullName: true } },
        facture: { select: { type: true, mois: true, dateLimite: true } },
      },
    }),
  ]);

  return {
    tronque: total > EXPORT_MAX_LIGNES,
    lignes: rows.map((l) => ({
      type: l.facture.type,
      mois: l.facture.mois,
      locataire: l.locataire.fullName,
      coefficient: Number(l.coefficient),
      montantDu: Number(l.montantDu),
      montantPaye: Number(l.montantPaye),
      statut: l.statut,
      dateLimite: new Date(l.facture.dateLimite).toISOString().slice(0, 10),
    })),
  };
}

/**
 * A tenant's PDF invoice (their line of a published invoice) — not to be
 * confused with the receipt, which only attests to a payment. For rent, the
 * document carries the annual tracking: paid this month, paid year to date,
 * still due.
 *
 * Access is settled here, before anything is rendered: a tenant reads their own
 * line, Admin and Bailleur read anyone's.
 */
export async function getFactureLignePdf(
  ligneId: string,
  requester: { sub: string; role: Role },
): Promise<{ pdf: Buffer; filename: string }> {
  const ligne = await prisma.factureLocataire.findUnique({
    where: { id: ligneId },
    include: {
      locataire: { select: { id: true, fullName: true } },
      facture: {
        select: {
          type: true,
          typeKey: true,
          mois: true,
          dateLimite: true,
          statutPub: true,
          montantTotal: true,
        },
      },
      paiements: {
        orderBy: { createdAt: "asc" },
        select: { montant: true, mode: true, reference: true, createdAt: true },
      },
    },
  });

  const gestionnaire = requester.role === "admin" || requester.role === "bailleur";
  // Same answer whether the line does not exist or belongs to someone else:
  // otherwise the 404/409 pair tells a tenant what exists on other accounts.
  if (!ligne || (!gestionnaire && ligne.locataire.id !== requester.sub)) {
    throw new ServiceError(404, "Ligne de facture introuvable.", "introuvable.ligneFacture");
  }
  if (ligne.facture.statutPub !== "publiee") {
    throw new ServiceError(
      409,
      "Facture non publiée : document indisponible.",
      "facture.nonPublieeDocument",
    );
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
    filename: `facture-${ligne.facture.typeKey}-${ligne.facture.mois}.pdf`.replace(
      /[^a-z0-9.-]+/gi,
      "-",
    ),
  };
}
