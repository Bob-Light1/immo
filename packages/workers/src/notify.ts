import { prisma } from "@campusgest/db";
import { DEFAULT_LOCALE, renderNotif, type NotifKey, type NotifParams } from "@campusgest/shared";
import { publishNotif } from "./realtime";
import { sendPushToUser } from "./push";

/**
 * Keyed notifications from the jobs. Mirrors
 * `apps/web/lib/services/notification.service.ts` but stays self-contained in
 * the workers package, which cannot reach into the Next app.
 *
 * Rows store the catalogue key and its parameters so the inbox re-renders in
 * whatever language the reader is using; the default-locale rendering is
 * written alongside as the fallback for retired keys and for operators reading
 * the table directly. Push carries no UI locale, so it is rendered here in each
 * recipient's account language.
 */

export interface NotifMessage {
  userId: string;
  key: NotifKey;
  params?: NotifParams;
}

/** Row payload: the key, its parameters, and the default-locale rendering. */
export function notifRow(key: NotifKey, params?: NotifParams) {
  const fallback = renderNotif(key, DEFAULT_LOCALE, params);
  return {
    title: fallback?.title ?? key,
    body: fallback?.body ?? "",
    messageKey: key,
    params: params ?? {},
  };
}

export async function notifyEach(
  messages: NotifMessage[],
  type: "alerte_facture" | "anniversaire" | "systeme",
  channels: Record<string, boolean> = { inApp: true, push: true },
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
      channels,
    })),
  });

  publishNotif({ userIds });
  for (const m of messages) {
    const rendu = renderNotif(m.key, langues.get(m.userId), m.params);
    if (rendu) {
      void sendPushToUser(m.userId, { title: rendu.title, body: rendu.body, url: "/", tag: type });
    }
  }
}
