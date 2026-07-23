import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { notifyUsers } from "@/lib/services/notification.service";
import type { Role, TicketInput, TicketStatutInput } from "@campusgest/shared";

/**
 * Tickets de maintenance (conception §5.12) — signalement non urgent, distinct
 * du signal de détresse. Statut ouvert → en_cours → résolu, priorité,
 * assignation. Notification à l'auteur à chaque changement de statut.
 */

const STATUT_LABEL: Record<string, string> = {
  ouvert: "Ouvert",
  en_cours: "En cours",
  resolu: "Résolu",
};

export async function createTicket(authorId: string, input: TicketInput) {
  const ticket = await prisma.maintenanceTicket.create({
    data: {
      authorId,
      categorie: input.categorie,
      description: input.description,
      imageUrl: input.imageUrl ?? null,
      roomId: input.roomId ?? null,
    },
  });

  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    admins.map((a) => a.id),
    "maintenance",
    "Nouveau ticket de maintenance",
    `${input.categorie} — ${input.description.slice(0, 120)}`,
  );

  return ticket;
}

/** Admin : tous les tickets ; sinon uniquement les siens. */
export async function listTickets(
  user: { sub: string; role: Role },
  pagination: { page: number; limit: number },
) {
  const where = user.role === "admin" ? {} : { authorId: user.sub };
  const [total, items] = await prisma.$transaction([
    prisma.maintenanceTicket.count({ where }),
    prisma.maintenanceTicket.findMany({
      where,
      orderBy: [{ statut: "asc" }, { priorite: "desc" }, { createdAt: "desc" }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: {
        author: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function updateTicketStatut(id: string, input: TicketStatutInput) {
  const ticket = await prisma.maintenanceTicket.findUnique({ where: { id } });
  if (!ticket) throw new ServiceError(404, "Ticket introuvable.");

  const updated = await prisma.maintenanceTicket.update({
    where: { id },
    data: {
      statut: input.statut,
      ...(input.priorite !== undefined ? { priorite: input.priorite } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
    },
  });

  if (input.statut !== ticket.statut) {
    await notifyUsers(
      [ticket.authorId],
      "maintenance",
      "Mise à jour de votre ticket",
      `Votre ticket « ${ticket.categorie} » est maintenant : ${STATUT_LABEL[input.statut] ?? input.statut}.`,
    );
  }
  return updated;
}
