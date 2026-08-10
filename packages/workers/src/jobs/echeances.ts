import { prisma } from "@campusgest/db";
import {
  isLoyer,
  jourLocal,
  jourUTC,
  debutJourLocal,
  anneeDe,
  type NotifKey,
} from "@campusgest/shared";
import { notifyEach, type NotifMessage } from "../notify";

/**
 * Due-date job (daily) — design §5.1.
 *  1. Moves published, unpaid lines past their deadline to `retard`.
 *  2. Emits an in-app alert to the tenant at the D-2 / D0 / D+3 / D+7
 *     milestones.
 *
 * Rent is an annual flat amount settled by monthly instalments, so its line
 * carries a balance that is *expected* to stay open all year. Wording it like a
 * monthly bill announced "your 170 000 XAF invoice is 7 days late" to tenants
 * who were paying exactly as agreed — and over SMS. Rent therefore keeps the
 * same milestones (its deadline closes the covered year, a real due date) but
 * is phrased in terms of the year's remaining balance.
 *
 * Idempotent: can run several times a day without duplicating an alert
 * (deduplicated by milestone, invoice and day). Multichannel delivery
 * (push/SMS/email) is P2; this job only materializes the in-app notification.
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

export interface EcheancesResult {
  scanned: number;
  retardMarked: number;
  alertsCreated: number;
}

/**
 * Identity of an alert for the day: recipient, milestone, invoice type and
 * period. Deliberately excludes the remaining balance, which moves as payments
 * come in — matching on it would let a second run of the day alert twice.
 */
function cleAlerte(userId: string, jalon: string, type: string, periode: string): string {
  // JSON rather than a joined string: the invoice type is free text and could
  // otherwise contain the separator and collide with another alert's key.
  return JSON.stringify([userId, jalon, type, periode]);
}

export async function runEcheances(now: Date = new Date()): Promise<EcheancesResult> {
  const lignes = await prisma.factureLocataire.findMany({
    where: { facture: { statutPub: "publiee" }, statut: { in: [...UNPAID] } },
    include: {
      facture: { select: { type: true, mois: true, dateLimite: true } },
      // Push carries no UI locale, so the recipient's account language is the
      // only signal available to render it.
      locataire: { select: { language: true } },
    },
  });

  // The operator's civil "today" (local components) compared against @db.Date
  // values, which are stored and read at UTC midnight. Both are reduced to the
  // UTC frame so no off-by-one-day drift can creep in across time zones.
  const today = jourLocal(now);

  // Alerts already emitted during the operator's civil day, read in one query.
  // Deduplication used to cost a `count()` per unpaid line, and its lower bound
  // was the day *projected into UTC* rather than local midnight — east of
  // Greenwich that left the first hours of the day outside the window.
  // Rows written before the message catalogue carry no parameters and stay
  // invisible here: at worst one duplicate on the first run after deployment.
  const dejaEnvoyees = await prisma.notification.findMany({
    where: {
      type: "alerte_facture",
      targetUserId: { in: lignes.map((l) => l.locataireId) },
      createdAt: { gte: debutJourLocal(now) },
    },
    select: { targetUserId: true, params: true },
  });
  const vues = new Set<string>();
  for (const n of dejaEnvoyees) {
    const p = n.params as { jalon?: string; type?: string; periode?: string } | null;
    if (!n.targetUserId || !p?.jalon || !p.type || !p.periode) continue;
    vues.add(cleAlerte(n.targetUserId, p.jalon, p.type, p.periode));
  }

  const aMarquerRetard: string[] = [];
  // Batched by channel set: `notifyEach` writes the rows in one statement, and
  // SMS is reserved for a deadline already reached.
  const aAlerter = new Map<boolean, NotifMessage[]>([
    [true, []],
    [false, []],
  ]);

  for (const l of lignes) {
    const reste = l.montantDu - l.montantPaye;
    if (reste <= 0n) continue;

    const days = Math.round((today - jourUTC(new Date(l.facture.dateLimite))) / DAY_MS);

    // 1. Flag as overdue (deadline passed).
    if (days > 0 && l.statut !== "retard") aMarquerRetard.push(l.id);

    // 2. Alert at the current milestone.
    const jalon = JALONS[days];
    if (!jalon) continue;

    const loyer = isLoyer(l.facture.type);
    const periode = loyer ? anneeDe(l.facture.mois) : l.facture.mois;

    // Deduplicated on the identifying parameters rather than on the rendered
    // title, which is no longer stable across languages.
    const cle = cleAlerte(l.locataireId, jalon, l.facture.type, periode);
    if (vues.has(cle)) continue;
    vues.add(cle);

    const quand = days < 0 ? "Avant" : days === 0 ? "Jour" : "Retard";
    const key = (loyer ? `echeance.loyer${quand}` : `echeance.${quand.toLowerCase()}`) as NotifKey;

    aAlerter.get(days >= 0)!.push({
      userId: l.locataireId,
      key,
      params: { jalon, type: l.facture.type, periode, reste: Number(reste), jours: Math.abs(days) },
    });
  }

  if (aMarquerRetard.length > 0) {
    await prisma.factureLocataire.updateMany({
      where: { id: { in: aMarquerRetard } },
      data: { statut: "retard" },
    });
  }

  for (const [sms, messages] of aAlerter) {
    await notifyEach(messages, "alerte_facture", { push: true, sms, email: false });
  }

  return {
    scanned: lignes.length,
    retardMarked: aMarquerRetard.length,
    alertsCreated: aAlerter.get(true)!.length + aAlerter.get(false)!.length,
  };
}
