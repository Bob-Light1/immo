import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { CreateCompteurInput, UpdateCompteurInput } from "@campusgest/shared";

/**
 * Meters (design §3). A meter is what a water or electricity invoice is raised
 * against: `Facture.compteurId` points here, and the reading kept on the meter
 * (`dernierIndex`) is the figure the next consumption is measured from — the
 * `I` of the estimate formula (§5.11).
 */

const COMPTEUR_ORDER = [{ type: "asc" as const }, { libelle: "asc" as const }];

/**
 * Same label twice on the same kind of meter makes the invoice selector
 * unreadable — two indistinguishable "Bloc A" lines to pick a meter from. Not a
 * database constraint: existing installations may already carry duplicates.
 */
async function assertLibelleLibre(
  type: CreateCompteurInput["type"],
  libelle: string,
  exceptId?: string,
) {
  const existant = await prisma.compteur.findFirst({
    where: {
      type,
      libelle: { equals: libelle, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existant) {
    throw new ServiceError(
      409,
      `Un compteur « ${libelle} » existe déjà pour ce type.`,
      "compteur.libelleDuplique",
      { libelle },
    );
  }
}

/**
 * Every meter, with what depends on it. The counts are what tells the Admin a
 * meter is in use before they try to delete it.
 */
export async function listCompteurs() {
  const items = await prisma.compteur.findMany({
    orderBy: COMPTEUR_ORDER,
    include: { _count: { select: { factures: true, chambres: true } } },
  });
  return { items };
}

export async function createCompteur(input: CreateCompteurInput) {
  await assertLibelleLibre(input.type, input.libelle);
  return prisma.compteur.create({
    data: {
      type: input.type,
      libelle: input.libelle,
      scope: input.scope,
      dernierIndex: BigInt(input.dernierIndex),
    },
    include: { _count: { select: { factures: true, chambres: true } } },
  });
}

/** Renames, re-scopes or records a new reading. The type stays what it was. */
export async function updateCompteur(id: string, input: UpdateCompteurInput) {
  const compteur = await prisma.compteur.findUnique({ where: { id } });
  if (!compteur) throw new ServiceError(404, "Compteur introuvable.", "introuvable.compteur");

  if (input.libelle !== undefined) {
    await assertLibelleLibre(compteur.type, input.libelle, id);
  }

  return prisma.compteur.update({
    where: { id },
    data: {
      ...(input.libelle !== undefined ? { libelle: input.libelle } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.dernierIndex !== undefined
        ? { dernierIndex: BigInt(input.dernierIndex) }
        : {}),
    },
    include: { _count: { select: { factures: true, chambres: true } } },
  });
}

/**
 * Deletes a meter that nothing points at. An invoice records which meter it was
 * raised against; a room records which one bills its electricity. Cutting either
 * link on delete would erase that, so the meter stays until it is detached.
 */
export async function deleteCompteur(id: string) {
  const compteur = await prisma.compteur.findUnique({
    where: { id },
    include: { _count: { select: { factures: true, chambres: true } } },
  });
  if (!compteur) throw new ServiceError(404, "Compteur introuvable.", "introuvable.compteur");

  const { factures, chambres } = compteur._count;
  if (factures > 0 || chambres > 0) {
    throw new ServiceError(
      409,
      `Compteur utilisé : ${factures} facture(s) et ${chambres} chambre(s) y sont rattachées.`,
      "compteur.utilise",
      { factures, chambres },
    );
  }

  await prisma.compteur.delete({ where: { id } });
  return { ok: true };
}
