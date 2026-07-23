import webpush from "web-push";
import { prisma, Prisma } from "@campusgest/db";

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
    select: { pushSubscription: true, notifPrefs: true },
  });
  if (!user?.pushSubscription) return;
  const prefs = user.notifPrefs as { push?: boolean } | null;
  if (prefs?.push === false) return;

  try {
    await webpush.sendNotification(
      user.pushSubscription as unknown as webpush.PushSubscription,
      JSON.stringify(payload),
    );
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await prisma.user
        .update({ where: { id: userId }, data: { pushSubscription: Prisma.JsonNull } })
        .catch(() => {});
    } else {
      console.error("[push]", status ?? (e as Error).message);
    }
  }
}
