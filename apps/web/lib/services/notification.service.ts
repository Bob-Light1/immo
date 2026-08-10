import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";
import { publishNotif } from "@/lib/realtime";
import {
  renderNotif,
  DEFAULT_LOCALE,
  type AnnonceInput,
  type NotificationType,
  type NotifKey,
  type NotifParams,
  type Role,
} from "@campusgest/shared";

/** A catalogue entry plus its parameters — see `@campusgest/shared`. */
export interface NotifContent {
  key: NotifKey;
  params?: NotifParams;
}

export interface NotifMessage extends NotifContent {
  userId: string;
}

/**
 * Row payload for callers that must write the notification themselves — inside
 * a transaction, or against a role rather than a named user.
 */
export function notifRow(key: NotifKey, params?: NotifParams) {
  const fallback = renderNotif(key, DEFAULT_LOCALE, params);
  return {
    title: fallback?.title ?? key,
    body: fallback?.body ?? "",
    messageKey: key,
    params: params ?? {},
  };
}

/** Renders a message in a single user's account language (push has no UI locale). */
export async function renderForUser(userId: string, content: NotifContent) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
  return renderNotif(content.key, user?.language, content.params);
}

/**
 * Notifies several users with a message written for each of them.
 *
 * `notifyUsers` broadcasts one identical body; some events cannot use it
 * without lying — telling a tenant an invoice is published is only useful if it
 * carries *their* amount. One write and one SSE bump for the whole batch, push
 * fanned out per recipient.
 *
 * Messages are stored as a catalogue key plus its parameters, so the inbox
 * re-renders in whatever language the reader is using at the time; the
 * default-locale rendering is written alongside as the fallback for readers of
 * rows whose key is retired. Push has no UI locale to read from, so it is
 * rendered here in each recipient's account language.
 */
export async function notifyEach(
  messages: NotifMessage[],
  type: NotificationType,
): Promise<void> {
  if (messages.length === 0) return;
  const userIds = messages.map((m) => m.userId);

  const langues = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, language: true },
      })
    ).map((u) => [u.id, u.language]),
  );

  await prisma.notification.createMany({
    data: messages.map((m) => ({
      targetUserId: m.userId,
      type,
      ...notifRow(m.key, m.params),
      channels: { inApp: true, push: true },
    })),
  });

  publishNotif({ userIds });
  void Promise.allSettled(
    messages.map((m) => {
      const rendu = renderNotif(m.key, langues.get(m.userId), m.params);
      if (!rendu) return Promise.resolve();
      return sendPushToUser(m.userId, {
        title: rendu.title,
        body: rendu.body,
        url: "/",
        tag: type,
      });
    }),
  );
}

/** Notifies a list of users with one shared message (in-app + best-effort push). */
export async function notifyUsers(
  userIds: string[],
  type: NotificationType,
  content: NotifContent,
): Promise<void> {
  await notifyEach(
    userIds.map((userId) => ({ userId, ...content })),
    type,
  );
}

/** Notifies every active user. */
export async function notifyAllActive(
  type: NotificationType,
  content: NotifContent,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), type, content);
}

/**
 * Notifies every active user with free text.
 *
 * Reserved for human-authored content — community posts, announcements — which
 * has no catalogue key and therefore reaches every resident in the language its
 * author wrote it in.
 */
export async function notifyAllActiveText(
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  const userIds = users.map((u) => u.id);
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
  publishNotif({ userIds });
  void sendPushToUsers(userIds, { title, body, url: "/", tag: type });
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

/**
 * Reading language. The interface locale wins when the caller supplies one: it
 * is what the reader is looking at right now, and it stays correct during the
 * moment between switching language and the preference reaching the account.
 * Falling back to the stored preference keeps push and inbox consistent for any
 * caller that has no UI context.
 */
async function readingLocale(userId: string, locale?: string): Promise<string> {
  if (locale) return locale;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
  return user?.language ?? DEFAULT_LOCALE;
}

/**
 * Re-renders a stored row in `locale`. Rows without a key — announcements,
 * community posts, anything written before the catalogue existed — keep the
 * prose they were saved with.
 */
export function localizeNotification<
  T extends { messageKey: string | null; params: unknown; title: string; body: string },
>(notification: T, locale: string): T {
  if (!notification.messageKey) return notification;
  const rendu = renderNotif(
    notification.messageKey,
    locale,
    (notification.params ?? {}) as NotifParams,
  );
  return rendu ? { ...notification, title: rendu.title, body: rendu.body } : notification;
}

export async function listNotifications(
  userId: string,
  role: Role,
  pagination: { page: number; limit: number },
  locale?: string,
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

  // Keyed rows are re-rendered on every read: a resident who switches language
  // finds their whole inbox translated, not only what arrives afterwards.
  const lang = await readingLocale(userId, locale);
  const traduits = items.map((n) => localizeNotification(n, lang));

  return { items: traduits, total, page: pagination.page, limit: pagination.limit, unread };
}

export function unreadCount(userId: string, role: Role) {
  return prisma.notification.count({ where: { ...visibleWhere(userId, role), isRead: false } });
}

export async function markRead(id: string, userId: string, role: Role) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw new ServiceError(404, "Notification introuvable.", "introuvable.notification");
  if (n.targetUserId !== userId && n.targetRole !== role) {
    throw new ServiceError(403, "Accès refusé à cette notification.", "notification.accesRefuse");
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
    throw new ServiceError(
      400,
      "Aucun destinataire actif pour cette portée.",
      "notification.aucunDestinataire",
    );
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
