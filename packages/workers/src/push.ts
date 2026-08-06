import webpush from "web-push";
import { prisma } from "@campusgest/db";

/**
 * Web Push depuis les jobs (alertes d'échéance). Best-effort, respecte
 * `notif_prefs.push`, purge les abonnements expirés. Identique au sender du web
 * (apps/web/lib/push.ts) mais autonome au paquet workers.
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
        // Seul l'appareil dont l'endpoint a expiré est retiré, pas les autres.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", status ?? (e as Error).message);
        }
      }
    }),
  );
}
