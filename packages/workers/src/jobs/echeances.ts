import { prisma } from "@campusgest/db";
import { publishNotif } from "../realtime";
import { sendPushToUser } from "../push";

/**
 * Job échéances (quotidien) — conception §5.1.
 *  1. Passe en `retard` les lignes publiées non soldées dont la date limite
 *     est dépassée.
 *  2. Émet une alerte in-app au locataire aux jalons J-2 / J0 / J+3 / J+7.
 *
 * Idempotent : relançable plusieurs fois le même jour sans doublon d'alerte
 * (déduplication par titre + jour). La livraison multicanal (push/SMS/email)
 * relève du P2 ; ici on matérialise la notification interne.
 */

const DAY_MS = 86_400_000;
const UNPAID = ["en_attente", "partiel", "retard"] as const;

// Jalons d'alerte en jours relatifs à l'échéance (négatif = avant).
const JALONS: Record<number, string> = {
  [-2]: "J-2",
  [0]: "J0",
  [3]: "J+3",
  [7]: "J+7",
};

// Jour calendaire en repère UTC. `now` est interprété sur ses composantes
// locales (le « aujourd'hui » de l'exploitant) ; les dates @db.Date sont
// stockées/lues en minuit UTC, donc lues sur leurs composantes UTC. Comparer
// les deux en UTC évite tout décalage d'un jour selon le fuseau.
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

    // 1. Marquage retard (échéance dépassée).
    if (days > 0 && l.statut !== "retard") {
      await prisma.factureLocataire.update({
        where: { id: l.id },
        data: { statut: "retard" },
      });
      retardMarked++;
    }

    // 2. Alerte au jalon courant.
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
