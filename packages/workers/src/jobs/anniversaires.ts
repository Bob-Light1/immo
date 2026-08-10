import { prisma } from "@campusgest/db";
import { BIRTHDAY_NOTICE_DAYS } from "@campusgest/shared";
import { notifyEach } from "../notify";

/**
 * Birthday job (daily) — design §5.6. D-7 reminder (opt-in): for every active
 * user who filled in their date and allowed it to be shared
 * (`birthday_public`), if the birthday falls in BIRTHDAY_NOTICE_DAYS days,
 * notifies every active user. Idempotent (deduplicated by celebrant + day).
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

    // Deduplicated on the celebrant rather than on the rendered title, which is
    // no longer stable across languages. Rows written before the message
    // catalogue carry no parameters and are invisible here — at worst one
    // duplicate on the first run after deployment.
    const deja = await prisma.notification.count({
      where: {
        type: "anniversaire",
        createdAt: { gte: today },
        params: { path: ["celebrantId"], equals: u.id },
      },
    });
    if (deja > 0) continue;

    const params = {
      celebrantId: u.id,
      name: u.fullName,
      date: target.toISOString(),
    };
    await notifyEach(
      actifs.map((a) => ({ userId: a.id, key: "anniversaire" as const, params })),
      "anniversaire",
    );
    notifications += actifs.length;
  }

  return { birthdays, notifications };
}
