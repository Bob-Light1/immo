import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { ProjetInput, Role } from "@campusgest/shared";

/**
 * Shared project & contributions (design §5.10). The Admin publishes a project
 * visible to the chosen roles; users contribute and the pot (collected /
 * target) grows.
 */

function isVisible(visibleRoles: unknown, role: Role): boolean {
  const roles = visibleRoles as string[] | null;
  return !roles || roles.length === 0 || roles.includes(role);
}

export async function createProjet(adminId: string, input: ProjetInput) {
  return prisma.projetCommun.create({
    data: {
      createdById: adminId,
      titre: input.titre,
      description: input.description,
      objectifs: input.objectifs ?? [],
      vision: input.vision ?? null,
      besoinsFinanciers: input.besoinsFinanciers != null ? BigInt(input.besoinsFinanciers) : null,
      montantContribution: input.montantContribution != null ? BigInt(input.montantContribution) : null,
      imageUrl: input.imageUrl ?? null,
      visibleRoles: input.visibleRoles ?? undefined,
    },
  });
}

export async function listProjets(role: Role, pagination: { page: number; limit: number }) {
  const projets = await prisma.projetCommun.findMany({
    orderBy: { createdAt: "desc" },
    include: { contributions: { select: { montant: true } } },
  });
  const visible = projets.filter((p) => isVisible(p.visibleRoles, role));
  const items = visible
    .slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit)
    .map((p) => ({
      id: p.id,
      titre: p.titre,
      description: p.description,
      objectifs: (p.objectifs as string[] | null) ?? [],
      vision: p.vision,
      imageUrl: p.imageUrl,
      besoinsFinanciers: p.besoinsFinanciers != null ? Number(p.besoinsFinanciers) : null,
      montantContribution: p.montantContribution != null ? Number(p.montantContribution) : null,
      collecte: p.contributions.reduce((s, c) => s + Number(c.montant), 0),
      nbContributions: p.contributions.length,
      createdAt: p.createdAt,
    }));
  return { items, total: visible.length, page: pagination.page, limit: pagination.limit };
}

export async function contribuer(
  projetId: string,
  user: { sub: string; role: Role },
  montant: number,
) {
  const projet = await prisma.projetCommun.findUnique({ where: { id: projetId } });
  if (!projet) throw new ServiceError(404, "Projet introuvable.");
  if (!isVisible(projet.visibleRoles, user.role)) {
    throw new ServiceError(403, "Ce projet ne vous est pas accessible.");
  }
  const contribution = await prisma.projetContribution.create({
    data: { projetId, userId: user.sub, montant: BigInt(montant) },
  });
  return { id: contribution.id, montant: Number(contribution.montant) };
}
