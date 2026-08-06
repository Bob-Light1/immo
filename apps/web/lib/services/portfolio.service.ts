import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { PortfolioInput } from "@campusgest/shared";

/**
 * Professional portfolio (§5.7) & resident directory (§5.14). A portfolio is
 * visible to everyone (networking); the directory is a derived view filterable
 * by skill/degree and availability for recommendations.
 */

export async function getPortfolio(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, portfolio: true },
  });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");
  return { userId: user.id, fullName: user.fullName, role: user.role, portfolio: user.portfolio };
}

export async function upsertPortfolio(userId: string, input: PortfolioInput) {
  const data = {
    bio: input.bio ?? null,
    photoUrl: input.photoUrl || null,
    competences: input.competences ?? [],
    diplomes: input.diplomes ?? [],
    realisations: input.realisations ?? [],
    contact: input.contact ?? null,
    emailPro: input.emailPro || null,
    dispoRecommandation: input.dispoRecommandation ?? false,
  };
  await prisma.portfolio.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return getPortfolio(userId);
}

/**
 * Removes a portfolio from the directory (§5.7). The account stays intact: only
 * the professional profile disappears, and its owner can recreate it.
 */
export async function deletePortfolio(userId: string) {
  const existe = await prisma.portfolio.findUnique({ where: { userId }, select: { id: true } });
  if (!existe) throw new ServiceError(404, "Aucun portfolio à retirer.");
  await prisma.portfolio.delete({ where: { userId } });
  return { ok: true };
}

export async function searchAnnuaire(skill: string | undefined, dispoOnly: boolean) {
  const portfolios = await prisma.portfolio.findMany({
    where: dispoOnly ? { dispoRecommandation: true } : {},
    include: { user: { select: { id: true, fullName: true, role: true, isActive: true } } },
  });
  const q = (skill ?? "").trim().toLowerCase();
  return portfolios
    .filter((p) => p.user.isActive)
    .filter((p) => {
      if (!q) return true;
      const tags = [
        ...((p.competences as string[] | null) ?? []),
        ...((p.diplomes as string[] | null) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return tags.includes(q);
    })
    .map((p) => ({
      userId: p.user.id,
      fullName: p.user.fullName,
      role: p.user.role,
      photoUrl: p.photoUrl,
      bio: p.bio,
      competences: (p.competences as string[] | null) ?? [],
      dispoRecommandation: p.dispoRecommandation,
      contact: p.contact,
      emailPro: p.emailPro,
    }));
}
