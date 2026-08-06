import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { notifyUsers, notifyAllActive } from "@/lib/services/notification.service";
import type { EvenementInput } from "@campusgest/shared";

/**
 * Event scheduling (design §5.5). Any user may propose an event; the Admin
 * approves or rejects it; the status (badge) is visible to everyone. The
 * creator is notified of each decision; an approval is announced to all.
 */

export async function createEvenement(creatorId: string, input: EvenementInput) {
  return prisma.evenement.create({
    data: {
      creatorId,
      titre: input.titre,
      description: input.description ?? null,
      dateEvent: input.dateEvent,
      heure: input.heure,
    },
  });
}

export async function listEvenements(pagination: { page: number; limit: number }) {
  const [total, items] = await prisma.$transaction([
    prisma.evenement.count(),
    prisma.evenement.findMany({
      orderBy: [{ dateEvent: "asc" }, { heure: "asc" }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: { creator: { select: { fullName: true } } },
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function decideEvenement(id: string, statut: "approuve" | "rejete") {
  const ev = await prisma.evenement.findUnique({ where: { id } });
  if (!ev) throw new ServiceError(404, "Événement introuvable.");
  if (ev.statut !== "en_attente") {
    throw new ServiceError(409, "Cet événement a déjà été traité.");
  }
  const updated = await prisma.evenement.update({ where: { id }, data: { statut } });

  const dateStr = new Date(ev.dateEvent).toLocaleDateString("fr-FR");
  if (statut === "approuve") {
    await notifyAllActive(
      "evenement",
      `Nouvel événement : ${ev.titre}`,
      `Le ${dateStr} à ${ev.heure}. Proposé et approuvé par l'administration.`,
    );
  } else {
    await notifyUsers(
      [ev.creatorId],
      "evenement",
      `Événement refusé : ${ev.titre}`,
      "Votre proposition d'événement n'a pas été retenue par l'administration.",
    );
  }
  return updated;
}
