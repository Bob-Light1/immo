import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { PushSubscriptionInput } from "@campusgest/shared";

/**
 * Web Push (VAPID) — conception §5.3 / §7.2. Envoi best-effort : une erreur de
 * push ne doit jamais faire échouer l'action métier. Respecte la préférence
 * `notif_prefs.push` de l'utilisateur ; purge les abonnements expirés (404/410).
 *
 * Un utilisateur peut être abonné depuis plusieurs appareils : l'envoi vise
 * tous ses abonnements, et seul celui qui expire est supprimé.
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
        // 404/410 : l'appareil s'est désabonné ou le navigateur a révoqué
        // l'endpoint. On retire cet appareil, pas les autres.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push]", status ?? (e as Error).message);
        }
      }
    }),
  );
}

/** Envoi parallèle, best-effort, à plusieurs utilisateurs. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}

/**
 * Enregistre l'abonnement de l'appareil courant. L'`endpoint` est son identité :
 * un réabonnement depuis le même navigateur met la ligne à jour, et un appareil
 * partagé est réattribué au compte qui vient de s'abonner (l'ancien propriétaire
 * ne reçoit donc plus rien dessus).
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
 * Désabonne un appareil. Avec `endpoint`, seul celui-ci est retiré — les autres
 * appareils de l'utilisateur continuent de recevoir. Sans (client incapable de
 * relire son abonnement), on retombe sur la purge complète du compte.
 */
export async function clearSubscription(userId: string, endpoint?: string): Promise<void> {
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return;
  }
  await prisma.pushSubscription.deleteMany({ where: { userId } });
}
