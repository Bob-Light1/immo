import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { notifyAllActive, notifyUsers } from "@/lib/services/notification.service";
import {
  DISTRESS_REVIEW_THRESHOLD,
  type DistressInput,
  type DistressPositionInput,
} from "@campusgest/shared";

/**
 * Signal de détresse encadré (conception §5.8 / §0.2). Le signal part TOUJOURS
 * (jamais de coupure silencieuse de la sécurité) ; l'anti-abus se contente de
 * mettre le compte « en revue » et d'alerter l'Admin au-delà d'un seuil. Seul un
 * ban manuel Admin (`distress_disabled`, journalisé) bloque l'émission.
 */

const REVIEW_WINDOW_MS = 3 * 86_400_000; // 3 jours

export async function sendDistress(userId: string, input: DistressInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, distressDisabled: true, distressReview: true },
  });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");
  if (user.distressDisabled) {
    throw new ServiceError(403, "Votre accès au signal de détresse a été suspendu par l'administration.");
  }

  // Anti-abus : nombre de signaux sur la fenêtre glissante.
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

  // Diffusion temps réel à tous les actifs (push forcé), marquée « à vérifier »
  // si le compte est en revue — mais le signal part quand même.
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
 * Rattache une position à un signal déjà émis (§5.8). Le signal part sans
 * attendre la géolocalisation : la position arrive quelques secondes plus tard,
 * une fois le navigateur interrogé. Réservée à l'émetteur, et seulement tant
 * que le signal n'est pas résolu — une position postérieure n'aurait plus de
 * valeur opérationnelle.
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
  // Idempotent : une position déjà rattachée n'est pas réécrite.
  if (signal.latitude != null) return { ok: true, alreadySet: true };

  await prisma.distressSignal.update({
    where: { id: signalId },
    data: { geoConsent: true, latitude: pos.latitude, longitude: pos.longitude },
  });

  // Relance de la diffusion : la position est l'information la plus utile pour
  // porter secours. Même `tag` push que l'alerte initiale → la notification est
  // remplacée sur l'appareil au lieu de s'empiler.
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

/** Ban / réactivation manuelle (journalisé en amont par la route). */
export async function setDistressBan(userId: string, disabled: boolean) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) throw new ServiceError(404, "Utilisateur introuvable.");
  await prisma.user.update({
    where: { id: userId },
    // Une réactivation lève aussi la mise en revue.
    data: { distressDisabled: disabled, ...(disabled ? {} : { distressReview: false }) },
  });
  return { ok: true, disabled };
}
