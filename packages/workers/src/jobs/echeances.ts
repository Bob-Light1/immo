import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { sendPushToUser } from "../push";

/**
 * Due-date job (daily) — design §5.1.
 *  1. Moves published, unpaid lines past their deadline to `retard`.
 *  2. Emits an in-app alert to the tenant at the D-2 / D0 / D+3 / D+7
 *     milestones.
 *
 * Idempotent: can run several times a day without duplicating an alert
 * (deduplicated by title + day). Multichannel delivery (push/SMS/email) is P2;
 * this job only materializes the in-app notification.
 */

const DAY_MS = 86_400_000;
const UNPAID = ["en_attente", "partiel", "retard"] as const;

// Alert milestones in days relative to the deadline (negative = before).
const JALONS: Record<number, string> = {
  [-2]: "J-2",
  [0]: "J0",
  [3]: "J+3",
  [7]: "J+7",
};

// Calendar day in the UTC frame. `now` is read from its local components (the
// operator's "today"), whereas @db.Date values are stored and read at UTC
// midnight, hence read from their UTC components. Comparing both in UTC avoids
// any off-by-one-day drift across time zones.
function calLocal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
function calUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface EcheancesResult {
  scanned: number;
  retardMarked: number;
  alertsCreated: number;
}

export async function runEcheances(now: Date = new Date()): Promise<EcheancesResult> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee" }, statut: { in: [...UNPAID] } },
    include: {
      facture: { select: { type: true, mois: true, dateLimite: true } },
    },
  });

  const today = calLocal(now);
  let retardMarked = 0;
  let alertsCreated = 0;

  for (const l of lignes) {
    const reste = l.montantDu - l.montantPaye;
    if (reste <= 0n) continue;

    const days = Math.round((today - calUTC(new Date(l.facture.dateLimite))) / DAY_MS);

    // 1. Flag as overdue (deadline passed).
    if (days > 0 && l.statut !== "retard") {
      await prisma.factureLocataire.update({
        where: { id: l.id },
        data: { statut: "retard" },
      });
      retardMarked++;
    }

    // 2. Alert at the current milestone.
    const jalon = JALONS[days];
    if (!jalon) continue;

    const title = `Échéance ${jalon} — ${l.facture.type} ${l.facture.mois}`;
    const dejaEnvoye = await prisma.notification.count({
      where: {
        targetUserId: l.locataireId,
        type: "alerte_facture",
        title,
        createdAt: { gte: new Date(today) },
      },
    });
    if (dejaEnvoye > 0) continue;

    const resteXAF = `${Number(reste).toLocaleString("fr-FR")} XAF`;
    const body =
      days < 0
        ? `Votre facture ${l.facture.type} (${l.facture.mois}) de ${resteXAF} arrive à échéance dans ${-days} jour(s).`
        : days === 0
          ? `Votre facture ${l.facture.type} (${l.facture.mois}) de ${resteXAF} arrive à échéance aujourd'hui.`
          : `Votre facture ${l.facture.type} (${l.facture.mois}) de ${resteXAF} est en retard de ${days} jour(s).`;

    await prisma.notification.create({
      data: {
        targetUserId: l.locataireId,
        type: "alerte_facture",
        title,
        body,
        channels: { push: true, sms: days >= 0, email: false },
      },
    });
    publishNotif({ userIds: [l.locataireId] });
    void sendPushToUser(l.locataireId, { title, body, url: "/", tag: "echeance" });
    alertsCreated++;
  }

  return { scanned: lignes.length, retardMarked, alertsCreated };
}
