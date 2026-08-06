import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { notifyAllActive, notifyUsers } from "@/lib/services/notification.service";
import {
  DISTRESS_REVIEW_THRESHOLD,
  type DistressInput,
  type DistressPositionInput,
} from "@campusgest/shared";

/**
 * Guarded distress signal (design §5.8 / §0.2). The signal is ALWAYS sent
 * (safety is never cut off silently); past a threshold the anti-abuse logic
 * only flags the account "under review" and alerts the Admin. Only a manual
 * Admin ban (`distress_disabled`, audited) blocks emission.
 */

const REVIEW_WINDOW_MS = 3 * 86_400_000; // 3 days

export async function sendDistress(userId: string, input: DistressInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, distressDisabled: true, distressReview: true },
  });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");
  if (user.distressDisabled) {
    throw new ServiceError(403, "Votre accès au signal de détresse a été suspendu par l'administration.");
  }

  // Anti-abuse: number of signals over the sliding window.
  const since = new Date(Date.now() - REVIEW_WINDOW_MS);
  const recent = await prisma.distressSignal.count({
    where: { senderId: userId, sentAt: { gte: since } },
  });
  const enRevue = user.distressReview || recent + 1 >= DISTRESS_REVIEW_THRESHOLD;

  const consent = input.geoConsent === true;
  const signal = await prisma.distressSignal.create({
    data: {
      senderId: userId,
      geoConsent: consent,
      latitude: consent ? input.latitude ?? null : null,
      longitude: consent ? input.longitude ?? null : null,
    },
  });

  if (enRevue && !user.distressReview) {
    await prisma.user.update({ where: { id: userId }, data: { distressReview: true } });
  }

  // Real-time broadcast to every active user (forced push), flagged "to be
  // checked" when the account is under review — the signal still goes out.
  const flag = enRevue ? " (à vérifier)" : "";
  const loc = signal.latitude != null ? " Position partagée." : "";
  await notifyAllActive(
    "detresse",
    `🚨 Signal de détresse${flag}`,
    `${user.fullName} a déclenché un signal de détresse.${loc}`,
  );

  if (enRevue) {
    const admins = await prisma.user.findMany({
      where: { role: "admin", isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      admins.map((a) => a.id),
      "detresse",
      "Signal de détresse en revue anti-abus",
      `${user.fullName} dépasse le seuil de signaux récents. À arbitrer (revue / ban).`,
    );
  }

  return { id: signal.id, review: enRevue };
}

/**
 * Attaches a position to an already-emitted signal (§5.8). The signal is sent
 * without waiting for geolocation: the position arrives a few seconds later,
 * once the browser has answered. Restricted to the sender, and only while the
 * signal is unresolved — a position sent afterwards would have no operational
 * value.
 */
export async function attachDistressPosition(
  signalId: string,
  userId: string,
  pos: DistressPositionInput,
) {
  const signal = await prisma.distressSignal.findUnique({ where: { id: signalId } });
  if (!signal) throw new ServiceError(404, "Signal introuvable.");
  if (signal.senderId !== userId) throw new ServiceError(403, "Ce signal n'est pas le vôtre.");
  if (signal.resolved) throw new ServiceError(409, "Signal déjà résolu.");
  // Idempotent: an already-attached position is never overwritten.
  if (signal.latitude != null) return { ok: true, alreadySet: true };

  await prisma.distressSignal.update({
    where: { id: signalId },
    data: { geoConsent: true, latitude: pos.latitude, longitude: pos.longitude },
  });

  // Re-broadcast: the position is the most useful information for a rescue.
  // Same push `tag` as the initial alert → the notification replaces the
  // previous one on the device instead of stacking up.
  const sender = await prisma.user.findUnique({
    where: { id: signal.senderId },
    select: { fullName: true },
  });
  await notifyAllActive(
    "detresse",
    "📍 Position reçue — signal de détresse",
    `${sender?.fullName ?? "Un résident"} : ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`,
  );

  return { ok: true, alreadySet: false };
}

export async function listDistress(pagination: { page: number; limit: number }) {
  const [total, items] = await prisma.$transaction([
    prisma.distressSignal.count(),
    prisma.distressSignal.findMany({
      orderBy: { sentAt: "desc" },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: {
        sender: {
          select: { id: true, fullName: true, distressReview: true, distressDisabled: true },
        },
      },
    }),
  ]);
  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function resolveDistress(id: string, adminId: string) {
  const s = await prisma.distressSignal.findUnique({ where: { id } });
  if (!s) throw new ServiceError(404, "Signal introuvable.");
  await prisma.distressSignal.update({
    where: { id },
    data: { resolved: true, resolvedById: adminId },
  });
  return { ok: true };
}

/** Manual ban / reactivation (audited upstream by the route). */
export async function setDistressBan(userId: string, disabled: boolean) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) throw new ServiceError(404, "Utilisateur introuvable.");
  await prisma.user.update({
    where: { id: userId },
    // A reactivation also clears the under-review flag.
    data: { distressDisabled: disabled, ...(disabled ? {} : { distressReview: false }) },
  });
  return { ok: true, disabled };
}
