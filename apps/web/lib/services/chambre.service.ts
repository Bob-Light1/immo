import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { CreateChambreInput, UpdateChambreInput } from "@campusgest/shared";

/**
 * Rooms (design §3). A room is where the rent tariff lives: `loyerAnnuel` is
 * what its occupants are billed for the year, and a rent invoice reads it to
 * fill each tenant's line. Rooms are not priced alike and the figure is
 * restated as rents follow inflation, which is why it is a property of the room
 * rather than of the invoice — the invoice merely freezes what the tariff was
 * when it was published.
 */

const CHAMBRE_ORDER = [{ bloc: "asc" as const }, { numero: "asc" as const }];

/**
 * What every room-returning call exposes. The occupants come with it because
 * they are what the Admin decides against — who a tariff change affects, and
 * whether a room can be deleted at all.
 */
const CHAMBRE_INCLUDE = {
  compteurElec: { select: { id: true, libelle: true, type: true } },
  occupants: {
    where: { isActive: true },
    orderBy: { fullName: "asc" as const },
    select: { id: true, fullName: true },
  },
  // Every account still pointing here, deactivated ones included. They are what
  // holds the room against deletion, and they are absent from `occupants`, so
  // without this the interface would offer a delete the server refuses.
  _count: { select: { occupants: true } },
} as const;

/**
 * Two rooms with the same block and number are the same room. The database
 * enforces it too; this is what turns the constraint into a sentence naming
 * the room instead of a bare duplicate error.
 */
async function assertNumeroLibre(bloc: string, numero: string, exceptId?: string) {
  const existante = await prisma.chambre.findFirst({
    where: {
      bloc: { equals: bloc, mode: "insensitive" },
      numero: { equals: numero, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existante) {
    throw new ServiceError(
      409,
      `La chambre ${bloc} ${numero} existe déjà.`,
      "chambre.numeroDuplique",
      { bloc, numero },
    );
  }
}

/**
 * The meter billing a room's electricity has to be an electricity meter: the
 * field is what an électricité invoice is read against, and a water meter
 * attached here would measure the wrong thing without ever failing.
 */
async function assertCompteurElec(compteurId: string | null | undefined) {
  if (!compteurId) return;
  const compteur = await prisma.compteur.findUnique({
    where: { id: compteurId },
    select: { type: true },
  });
  if (!compteur || compteur.type !== "electricite") {
    throw new ServiceError(
      400,
      "Compteur d'électricité introuvable.",
      "introuvable.compteur",
    );
  }
}

/**
 * Residents actually housed in a room. Counted apart rather than through a
 * filtered `_count`, which this Prisma version only offers behind a preview
 * flag; a deactivated account still points at its room but no longer takes up
 * a bed.
 */
function occupantsActifs(roomId: string) {
  return prisma.user.count({ where: { roomId, isActive: true } });
}

export async function listChambres() {
  const items = await prisma.chambre.findMany({
    orderBy: CHAMBRE_ORDER,
    include: CHAMBRE_INCLUDE,
  });
  return { items };
}

export async function createChambre(input: CreateChambreInput) {
  await assertNumeroLibre(input.bloc, input.numero);
  await assertCompteurElec(input.compteurElecId);
  return prisma.chambre.create({
    data: {
      bloc: input.bloc,
      numero: input.numero,
      capacite: input.capacite,
      loyerAnnuel: BigInt(input.loyerAnnuel),
      compteurElecId: input.compteurElecId ?? null,
    },
    include: CHAMBRE_INCLUDE,
  });
}

/**
 * Corrects a room — in practice, restates its rent at the turn of the year.
 *
 * The new tariff applies to what is billed next: invoices already published
 * froze the amount they were raised on, and that is what the tenants owe. A
 * draft is refilled on demand (`setLoyers({ depuisChambres: true })`), never
 * behind the Admin's back.
 */
export async function updateChambre(id: string, input: UpdateChambreInput) {
  const chambre = await prisma.chambre.findUnique({ where: { id } });
  if (!chambre) throw new ServiceError(404, "Chambre introuvable.", "introuvable.chambre");

  if (input.bloc !== undefined || input.numero !== undefined) {
    await assertNumeroLibre(input.bloc ?? chambre.bloc, input.numero ?? chambre.numero, id);
  }
  if (input.compteurElecId !== undefined) await assertCompteurElec(input.compteurElecId);

  const occupants = await occupantsActifs(id);
  // Retiring an occupied room would leave its residents housed in something the
  // interface no longer offers, and no invoice could name their tariff again.
  if (input.isActive === false && occupants > 0) {
    throw new ServiceError(
      409,
      `Chambre occupée par ${occupants} locataire(s) : déplacez-les avant de la retirer.`,
      "chambre.occupee",
      { count: occupants },
    );
  }
  // Capacity is what the assignment check reads; lowering it below the people
  // already in the room would leave an invariant broken on rows that exist.
  if (input.capacite !== undefined && input.capacite < occupants) {
    throw new ServiceError(
      409,
      `Chambre occupée par ${occupants} locataire(s) : la capacité ne peut pas descendre en dessous.`,
      "chambre.capaciteAtteinte",
      { capacite: input.capacite, occupants },
    );
  }

  return prisma.chambre.update({
    where: { id },
    data: {
      ...(input.bloc !== undefined ? { bloc: input.bloc } : {}),
      ...(input.numero !== undefined ? { numero: input.numero } : {}),
      ...(input.capacite !== undefined ? { capacite: input.capacite } : {}),
      ...(input.loyerAnnuel !== undefined
        ? { loyerAnnuel: BigInt(input.loyerAnnuel) }
        : {}),
      ...(input.compteurElecId !== undefined ? { compteurElecId: input.compteurElecId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: CHAMBRE_INCLUDE,
  });
}

/**
 * Deletes a room nobody lives in. An occupied room stays: `User.roomId` is what
 * says where a resident lives, and cutting the link on delete would silently
 * unhouse them. Deactivating is the way to retire a room from the lists.
 */
export async function deleteChambre(id: string) {
  const chambre = await prisma.chambre.findUnique({
    where: { id },
    include: { _count: { select: { occupants: true } } },
  });
  if (!chambre) throw new ServiceError(404, "Chambre introuvable.", "introuvable.chambre");

  if (chambre._count.occupants > 0) {
    throw new ServiceError(
      409,
      `Chambre occupée par ${chambre._count.occupants} locataire(s) : déplacez-les avant de la supprimer.`,
      "chambre.occupee",
      { count: chambre._count.occupants },
    );
  }

  await prisma.chambre.delete({ where: { id } });
  return { ok: true };
}

/**
 * A room that can take one more resident: in service, and not already full.
 *
 * Capacity is checked against the occupants on record rather than enforced by
 * the database — the residence's own count is what it means, and two admins
 * assigning the same last bed at the same moment is not a race worth a column
 * lock. Overshooting is visible on the room's list and fixed by moving someone.
 *
 * Exported for `createUser`, which houses a tenant the moment the account is
 * opened and must not be able to do so past what the room holds.
 */
export async function assertChambreDisponible(roomId: string) {
  const chambre = await prisma.chambre.findUnique({ where: { id: roomId } });
  if (!chambre) throw new ServiceError(404, "Chambre introuvable.", "introuvable.chambre");
  if (!chambre.isActive) {
    throw new ServiceError(
      409,
      `La chambre ${chambre.bloc} ${chambre.numero} est retirée du service.`,
      "chambre.inactive",
      { bloc: chambre.bloc, numero: chambre.numero },
    );
  }
  const occupants = await occupantsActifs(roomId);
  if (occupants >= chambre.capacite) {
    throw new ServiceError(
      409,
      `La chambre ${chambre.bloc} ${chambre.numero} est complète (${chambre.capacite} place(s)).`,
      "chambre.capaciteAtteinte",
      { capacite: chambre.capacite, occupants },
    );
  }
  return chambre;
}

/**
 * Moves a tenant into a room, or out of it (`roomId = null`).
 *
 * This is what makes the tariff reach an invoice: the rent lines are filled
 * from the room each tenant occupies, so an unassigned tenant has no rent the
 * system can state on their behalf.
 */
export async function assignerChambre(userId: string, roomId: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, roomId: true },
  });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.", "introuvable.user");
  if (user.role !== "locataire") {
    throw new ServiceError(
      400,
      "Seul un locataire occupe une chambre.",
      "chambre.roleNonLocataire",
    );
  }

  // Re-assigning a tenant to the room they already occupy is a no-op, and would
  // otherwise fail the capacity check on a full room they are counted in.
  if (roomId !== null && roomId !== user.roomId) await assertChambreDisponible(roomId);

  return prisma.user.update({
    where: { id: userId },
    data: { roomId },
    select: {
      id: true,
      fullName: true,
      roomId: true,
      room: { select: { id: true, bloc: true, numero: true, loyerAnnuel: true } },
    },
  });
}
