import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { sendPushToUser } from "@/lib/push";
import { publishNotif } from "@/lib/realtime";
import type { Role } from "@campusgest/shared";

/**
 * Suggestion box (design §5.4). Any user submits a numbered suggestion. The
 * Admin sees them all; the Bailleur only sees those explicitly made visible.
 * On the Admin's first open, a read notification is sent to the author
 * (read_at timestamped). Authors never learn who else can see their
 * suggestion.
 */

export async function createSuggestion(authorId: string, contenu: string) {
  const max = await prisma.suggestion.aggregate({ _max: { ordre: true } });
  return prisma.suggestion.create({
    data: { authorId, contenu, ordre: (max._max.ordre ?? 0) + 1 },
  });
}

/** Management list: Admin = all; Bailleur = only the visible ones. */
export async function listSuggestions(
  role: Role,
  pagination: { page: number; limit: number },
) {
  const where = role === "bailleur" ? { bailleurVisible: true } : {};
  const [total, items] = await prisma.$transaction([
    prisma.suggestion.count({ where }),
    prisma.suggestion.findMany({
      where,
      orderBy: { ordre: "asc" },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: { author: { select: { fullName: true } } },
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

/** The current user's suggestions (without exposing the recipients). */
export async function listMySuggestions(authorId: string) {
  return prisma.suggestion.findMany({
    where: { authorId },
    orderBy: { createdAt: "desc" },
    select: { id: true, contenu: true, createdAt: true, isReadAdmin: true, readAt: true },
  });
}

/** Marks a suggestion read by the Admin and notifies the author (once). */
export async function markSuggestionRead(id: string) {
  const s = await prisma.suggestion.findUnique({ where: { id } });
  if (!s) throw new ServiceError(404, "Suggestion introuvable.");
  if (s.isReadAdmin) return { ok: true, alreadyRead: true };

  await prisma.$transaction([
    prisma.suggestion.update({
      where: { id },
      data: { isReadAdmin: true, readAt: new Date() },
    }),
    prisma.notification.create({
      data: {
        targetUserId: s.authorId,
        type: "lecture",
        title: "Suggestion consultée",
        body: "L'administration a consulté votre suggestion. Merci pour votre contribution.",
        channels: { inApp: true },
      },
    }),
  ]);

  publishNotif({ userIds: [s.authorId] });

  void sendPushToUser(s.authorId, {
    title: "Suggestion consultée",
    body: "L'administration a consulté votre suggestion.",
    url: "/",
    tag: "lecture",
  });

  return { ok: true, alreadyRead: false };
}

export async function setSuggestionVisibility(id: string, bailleurVisible: boolean) {
  const s = await prisma.suggestion.findUnique({ where: { id } });
  if (!s) throw new ServiceError(404, "Suggestion introuvable.");
  await prisma.suggestion.update({ where: { id }, data: { bailleurVisible } });
  return { ok: true, bailleurVisible };
}
