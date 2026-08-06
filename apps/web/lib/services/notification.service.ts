import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { sendPushToUsers } from "@/lib/push";
import { publishNotif } from "@/lib/realtime";
import type { AnnonceInput, NotificationType, Role } from "@campusgest/shared";

/** Notifies a list of users (in-app + best-effort push). */
export async function notifyUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((id) => ({
      targetUserId: id,
      type,
      title,
      body,
      channels: { inApp: true, push: true },
    })),
  });
  // Wake the SSE streams of connected recipients (otherwise they would wait
  // for the next fallback poll).
  publishNotif({ userIds });
  void sendPushToUsers(userIds, { title, body, url: "/", tag: type });
}

/** Notifies every active user. */
export async function notifyAllActive(
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), type, title, body);
}

/**
 * In-app notifications (design §5.3). A user sees the notifications addressed
 * to them by name (`targetUserId`) or to their role (`targetRole`).
 * Announcements are fanned out into one notification per active recipient, so
 * the read/unread state stays correct per user.
 */

function visibleWhere(userId: string, role: Role) {
  return { OR: [{ targetUserId: userId }, { targetRole: role }] };
}

export async function listNotifications(
  userId: string,
  role: Role,
  pagination: { page: number; limit: number },
) {
  const where = visibleWhere(userId, role);
  const [total, items, unread] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit, unread };
}

export function unreadCount(userId: string, role: Role) {
  return prisma.notification.count({ where: { ...visibleWhere(userId, role), isRead: false } });
}

export async function markRead(id: string, userId: string, role: Role) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw new ServiceError(404, "Notification introuvable.");
  if (n.targetUserId !== userId && n.targetRole !== role) {
    throw new ServiceError(403, "Accès refusé à cette notification.");
  }
  if (!n.isRead) await prisma.notification.update({ where: { id }, data: { isRead: true } });
  return { ok: true };
}

export async function markAllRead(userId: string, role: Role) {
  const res = await prisma.notification.updateMany({
    where: { ...visibleWhere(userId, role), isRead: false },
    data: { isRead: true },
  });
  return { updated: res.count };
}

/** Creates an announcement and fans it out to every active recipient (§5.3). */
export async function createAnnonce(senderId: string, input: AnnonceInput) {
  const where =
    input.scope === "all"
      ? { isActive: true }
      : { isActive: true, role: input.scope as Role };
  const recipients = await prisma.user.findMany({ where, select: { id: true } });
  if (recipients.length === 0) {
    throw new ServiceError(400, "Aucun destinataire actif pour cette portée.");
  }
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      senderId,
      targetUserId: r.id,
      type: "annonce" as const,
      title: input.title,
      body: input.body,
      channels: { inApp: true, push: true },
    })),
  });

  publishNotif({ userIds: recipients.map((r) => r.id) });

  // Best-effort push, without blocking the response (async network delivery).
  void sendPushToUsers(recipients.map((r) => r.id), {
    title: input.title,
    body: input.body,
    url: "/",
    tag: "annonce",
  });

  return { sent: recipients.length };
}
