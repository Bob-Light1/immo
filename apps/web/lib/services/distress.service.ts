import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { notifyAllActive, notifyUsers } from "@/lib/services/notification.service";
import { DISTRESS_REVIEW_THRESHOLD, type DistressInput } from "@campusgest/shared";

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
