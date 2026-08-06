import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { BIRTHDAY_NOTICE_DAYS } from "@campusgest/shared";
import { sendPushToUser } from "../push";

/**
 * Birthday job (daily) — design §5.6. D-7 reminder (opt-in): for every active
 * user who filled in their date and allowed it to be shared
 * (`birthday_public`), if the birthday falls in BIRTHDAY_NOTICE_DAYS days,
 * notifies every active user. Idempotent (deduplicated by title + day).
 */

function startOfDayLocal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface AnniversairesResult {
  birthdays: number;
  notifications: number;
}

export async function runAnniversaires(now: Date = new Date()): Promise<AnniversairesResult> {
  // Target date = today + D-7 (operator's local components).
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
    // A @db.Date value is read at UTC midnight → read its UTC components.
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
