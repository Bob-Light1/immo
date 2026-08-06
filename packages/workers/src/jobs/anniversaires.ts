import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { BIRTHDAY_NOTICE_DAYS } from "@campusgest/shared";
import { sendPushToUser } from "../push";

/**
 * Job anniversaires (quotidien) — conception §5.6. Rappel J-7 (opt-in) : pour
 * chaque utilisateur actif ayant renseigné sa date et autorisé son partage
 * (`birthday_public`), si l'anniversaire tombe dans BIRTHDAY_NOTICE_DAYS jours,
 * notifie tous les utilisateurs actifs. Idempotent (dédup par titre + jour).
 */

function startOfDayLocal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface AnniversairesResult {
  birthdays: number;
  notifications: number;
}

export async function runAnniversaires(now: Date = new Date()): Promise<AnniversairesResult> {
  // Date cible = aujourd'hui + J-7 (composantes locales de l'exploitant).
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BIRTHDAY_NOTICE_DAYS);
  const tMonth = target.getMonth();
  const tDay = target.getDate();

  const users = await prisma.user.findMany({
    where: { isActive: true, birthdayPublic: true, birthday: { not: null } },
    select: { id: true, fullName: true, birthday: true },
  });

  const actifs = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  const today = new Date(startOfDayLocal(now));

  let birthdays = 0;
  let notifications = 0;

  for (const u of users) {
    const bd = new Date(u.birthday!);
    // Date @db.Date lue en minuit UTC → on lit ses composantes UTC.
    if (bd.getUTCMonth() !== tMonth || bd.getUTCDate() !== tDay) continue;
    birthdays++;

    const title = `Anniversaire de ${u.fullName}`;
    const deja = await prisma.notification.count({
      where: { type: "anniversaire", title, createdAt: { gte: today } },
    });
    if (deja > 0) continue;

    const dateStr = target.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const body = `C'est bientôt l'anniversaire de ${u.fullName}, le ${dateStr}. Pensez à lui souhaiter !`;

    await prisma.notification.createMany({
      data: actifs.map((a) => ({
        targetUserId: a.id,
        type: "anniversaire" as const,
        title,
        body,
        channels: { inApp: true, push: true },
      })),
    });
    notifications += actifs.length;
    publishNotif({ userIds: actifs.map((a) => a.id) });
    for (const a of actifs) void sendPushToUser(a.id, { title, body, url: "/", tag: "anniversaire" });
  }

  return { birthdays, notifications };
}
