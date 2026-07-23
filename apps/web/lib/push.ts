import webpush from "web-push";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PushSubscriptionInput } from "@campusgest/shared";

/**
 * Web Push (VAPID) — conception §5.3 / §7.2. Envoi best-effort : une erreur de
 * push ne doit jamais faire échouer l'action métier. Respecte la préférence
 * `notif_prefs.push` de l'utilisateur ; purge les abonnements expirés (404/410).
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

/** Envoi parallèle, best-effort, à plusieurs utilisateurs. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}

export async function saveSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { pushSubscription: sub as unknown as Prisma.InputJsonValue },
  });
}

export async function clearSubscription(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { pushSubscription: Prisma.JsonNull },
  });
}
