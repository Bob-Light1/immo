import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { PushSubscriptionInput } from "@campusgest/shared";

/**
 * Web Push (VAPID) — design §5.3 / §7.2. Best-effort delivery: a push error
 * must never fail the business action. Honours the user's `notif_prefs.push`
 * preference; purges dead subscriptions (403/404/410).
 *
 * A user may be subscribed from several devices: delivery targets all their
 * subscriptions, and only the expired one is deleted.
 */

let configured = false;
function ensure(): boolean {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@campusgest.local",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export function pushEnabled(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensure()) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifPrefs: true, pushSubscriptions: true },
  });
  if (!user || user.pushSubscriptions.length === 0) return;
  const prefs = user.notifPrefs as { push?: boolean } | null;
  if (prefs?.push === false) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    user.pushSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or the browser revoked the endpoint.
        // 403: the subscription was created under a previous VAPID key pair and
        // can never be delivered to again (rotation) — dropping it here is what
        // lets a key rotation heal itself instead of erroring on every send.
        // Remove that device only, never the others.
        if (status === 404 || status === 410 || status === 403) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", status ?? (e as Error).message);
        }
      }
    }),
  );
}

/** Parallel, best-effort delivery to several users. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}

/**
 * Stores the current device's subscription. The `endpoint` is its identity: a
 * re-subscription from the same browser updates the row, and a shared device is
 * reassigned to the account that just subscribed (the previous owner therefore
 * stops receiving anything on it).
 */
export async function saveSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    update: {
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Unsubscribes a device. With `endpoint`, only that one is removed — the user's
 * other devices keep receiving. Without it (client unable to read back its own
 * subscription), fall back to purging the whole account.
 */
export async function clearSubscription(userId: string, endpoint?: string): Promise<void> {
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return;
  }
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}
