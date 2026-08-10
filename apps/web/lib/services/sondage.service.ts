import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { SondageInput } from "@campusgest/shared";

/**
 * Polls & votes (design §5.13). Question + options, one vote per user
 * (changeable while the poll is open), real-time results, and closing by the
 * Admin.
 */

export async function createSondage(adminId: string, input: SondageInput) {
  return prisma.sondage.create({
    data: { question: input.question, options: input.options, createdById: adminId },
  });
}

export async function listSondages(userId: string, pagination: { page: number; limit: number }) {
  const [total, sondages] = await prisma.$transaction([
    prisma.sondage.count(),
    prisma.sondage.findMany({
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: { votes: { select: { userId: true, choix: true } } },
    }),
  ]);
  const items = sondages.map((s) => {
    const options = s.options as string[];
    return {
      id: s.id,
      question: s.question,
      options,
      counts: options.map((_, i) => s.votes.filter((v) => v.choix === i).length),
      totalVotes: s.votes.length,
      isOpen: s.isOpen,
      myVote: s.votes.find((v) => v.userId === userId)?.choix ?? null,
      createdAt: s.createdAt,
    };
  });
  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function vote(sondageId: string, userId: string, choix: number) {
  const s = await prisma.sondage.findUnique({ where: { id: sondageId } });
  if (!s) throw new ServiceError(404, "Sondage introuvable.", "introuvable.sondage");
  if (!s.isOpen) throw new ServiceError(409, "Ce sondage est clôturé.", "sondage.cloture");
  const options = s.options as string[];
  if (choix < 0 || choix >= options.length) throw new ServiceError(400, "Choix invalide.", "sondage.choixInvalide");

  await prisma.sondageVote.upsert({
    where: { sondageId_userId: { sondageId, userId } },
    create: { sondageId, userId, choix },
    update: { choix },
  });
  return { ok: true };
}

export async function closeSondage(id: string) {
  const s = await prisma.sondage.findUnique({ where: { id } });
  if (!s) throw new ServiceError(404, "Sondage introuvable.", "introuvable.sondage");
  await prisma.sondage.update({ where: { id }, data: { isOpen: false } });
  return { ok: true };
}
