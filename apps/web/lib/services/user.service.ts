import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import {
  repartirFacture,
  type CreateUserInput,
  type ChangeCredentialsInput,
} from "@campusgest/shared";

/** Mot de passe temporaire lisible (sans caractères ambigus). */
function genTempPassword(len = 8): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Crée un utilisateur (Admin). Génère un mot de passe temporaire renvoyé
 * en clair UNE fois à l'admin, qui le communique hors-bande (SMS/remise).
 * L'utilisateur devra le changer à sa première connexion (first_login = true).
 */
export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new ServiceError(409, "Nom d'utilisateur déjà pris.");

  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      username: input.username,
      fullName: input.fullName,
      role: input.role,
      email: input.email ? input.email : null,
      phone: input.phone ?? null,
      language: input.language,
      roomId: input.roomId ?? null,
      passwordHash,
      firstLogin: true,
    },
    select: { id: true, username: true, fullName: true, role: true, createdAt: true },
  });

  return { user, tempPassword };
}

export async function listUsers(
  filters: { role?: "admin" | "bailleur" | "locataire"; active?: boolean; q?: string },
  pagination: { page: number; limit: number },
) {
  const q = filters.q?.trim();
  const where = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.active !== undefined ? { isActive: filters.active } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        phone: true,
        isActive: true,
        firstLogin: true,
        createdAt: true,
      },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

/**
 * Désactivation (soft delete) : on conserve l'historique via les FK.
 * §5.1 : le locataire désactivé est retiré des factures non publiées
 * (recalcul de la répartition) ; les factures publiées restent figées.
 */
export async function deactivateUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");
  if (user.role === "admin") throw new ServiceError(400, "Impossible de désactiver un admin.");

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  });

  const lignesBrouillon = await prisma.factureLocataire.findMany({
    where: { locataireId: id, facture: { statutPub: "brouillon" } },
    select: { id: true, factureId: true },
  });

  for (const ligne of lignesBrouillon) {
    const facture = await prisma.facture.findUnique({
      where: { id: ligne.factureId },
      include: { lignes: true },
    });
    if (!facture) continue;

    const restantes = facture.lignes.filter((l) => l.id !== ligne.id);
    if (restantes.length === 0) {
      // Brouillon sans plus aucun destinataire : il n'est ni publiable
      // ni éditable, on le supprime (cascade sur la ligne).
      await prisma.facture.delete({ where: { id: facture.id } });
      continue;
    }

    const result = repartirFacture(
      Number(facture.montantTotal),
      restantes.map((l) => ({ locataireId: l.locataireId, coefficient: Number(l.coefficient) })),
    );
    await prisma.$transaction([
      prisma.factureLocataire.delete({ where: { id: ligne.id } }),
      ...result.lignes.map((l) =>
        prisma.factureLocataire.update({
          where: {
            factureId_locataireId: { factureId: facture.id, locataireId: l.locataireId },
          },
          data: { montantDu: BigInt(l.montantDu) },
        }),
      ),
      prisma.facture.update({
        where: { id: facture.id },
        data: { sommeCoeff: result.sommeCoeff, baseUnitaire: BigInt(result.baseUnitaire) },
      }),
    ]);
  }

  return updated;
}

/** Changement d'identifiants par l'utilisateur lui-même. */
export async function changeCredentials(userId: string, input: ChangeCredentialsInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) throw new ServiceError(400, "Mot de passe actuel incorrect.");

  const data: { passwordHash: string; firstLogin: boolean; tokenVersion: { increment: number }; username?: string } = {
    passwordHash: await bcrypt.hash(input.newPassword, 12),
    firstLogin: false,
    tokenVersion: { increment: 1 },
  };

  if (input.newUsername && input.newUsername !== user.username) {
    const taken = await prisma.user.findUnique({ where: { username: input.newUsername } });
    if (taken) throw new ServiceError(409, "Nom d'utilisateur déjà pris.");
    data.username = input.newUsername;
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  // tokenVersion a changé : l'appelant doit réémettre les jetons.
  return { username: updated.username, role: updated.role, tokenVersion: updated.tokenVersion };
}
