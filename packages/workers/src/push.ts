import webpush from "web-push";
import { prisma } from "@campusgest/db";

/**
 * Web Push from the jobs (due-date alerts). Best-effort: honours
 * `notif_prefs.push` and purges dead subscriptions. Mirrors the web sender
 * (apps/web/lib/push.ts) but stays self-contained in the workers package.
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
        // Only the device whose endpoint expired (404/410) or whose subscription
        // predates the current VAPID key pair (403, after a rotation) is
        // removed, never the others.
        if (status === 404 || status === 410 || status === 403) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", status ?? (e as Error).message);
        }
      }
    }),
  );
}
