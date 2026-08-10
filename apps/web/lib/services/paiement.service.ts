import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { paiementRecuPdf, type RecuData } from "@/lib/pdf";
import type { PaiementInput, Role } from "@campusgest/shared";

/**
 * Records a payment (full or partial) against an invoice line.
 *
 * The balance is read, checked and written inside a single transaction, and the
 * write is *conditional* on the balance that was read (`montantPaye` in the
 * where clause) with `montantPaye` moved by increment rather than assignment.
 * Two cashiers settling the same line at once — or one double-submitted form —
 * used to have the second write overwrite the first: the payment row and its
 * receipt survived while the money vanished from the balance. Now the loser of
 * the race finds no matching row and is told to retry against the fresh figure.
 */
export async function recordPaiement(adminId: string, input: PaiementInput) {
  const montant = BigInt(input.montant);

  return prisma.$transaction(async (tx) => {
    const ligne = await tx.factureLocataire.findUnique({
      where: { id: input.factureLocataireId },
      include: { facture: { select: { statutPub: true } } },
    });
    if (!ligne) throw new ServiceError(404, "Ligne de facture introuvable.", "introuvable.ligneFacture");
    if (ligne.facture.statutPub !== "publiee") {
      throw new ServiceError(
        409,
        "Impossible d'encaisser : facture non publiée.",
        "paiement.factureNonPubliee",
      );
    }

    const reste = ligne.montantDu - ligne.montantPaye;
    if (montant > reste) {
      throw new ServiceError(
        400,
        `Le montant dépasse le solde restant (${reste} XAF).`,
        "paiement.montantDepasseSolde",
        { reste: Number(reste) },
      );
    }

    const nouveauPaye = ligne.montantPaye + montant;
    const solde = nouveauPaye >= ligne.montantDu;

    const { count } = await tx.factureLocataire.updateMany({
      // `montantPaye` acts as the optimistic-lock version: a concurrent payment
      // committed since the read makes this match nothing.
      where: { id: ligne.id, montantPaye: ligne.montantPaye },
      data: {
        montantPaye: { increment: montant },
        // A part payment settles nothing about the deadline: an overdue line
        // stays overdue. Overwriting the status with "partiel" cleared the flag
        // until the next 07:00 run of the due-date job put it back, and the
        // dashboard's overdue count dipped with it for the rest of the day.
        statut: solde ? "paye" : ligne.statut === "retard" ? "retard" : "partiel",
        datePaiement: solde ? new Date() : null,
      },
    });
    if (count === 0) {
      throw new ServiceError(
        409,
        "Un autre encaissement vient d'être enregistré sur cette ligne. Rechargez la facture et vérifiez le solde restant.",
        "paiement.encaissementConcurrent",
      );
    }

    return tx.paiement.create({
      data: {
        factureLocataireId: ligne.id,
        montant,
        mode: input.mode,
        reference: input.reference ?? null,
        justificatifUrl: input.justificatifUrl ?? null,
        recordedById: adminId,
      },
    });
  });
}

/**
 * Cancels a wrongly recorded payment and restores the line's balance (§5.2).
 *
 * Cash is entered by hand, so a wrong amount, mode or tenant was bound to
 * happen; without this the mistake was permanent and its receipt stayed
 * downloadable forever. The row is removed rather than flagged, precisely so
 * the receipt stops resolving — the audit log (with the caller's `motif`) is
 * what keeps the account of it.
 */
export async function cancelPaiement(paiementId: string) {
  return prisma.$transaction(async (tx) => {
    const paiement = await tx.paiement.findUnique({
      where: { id: paiementId },
      include: { ligne: { select: { id: true, montantDu: true, montantPaye: true, statut: true } } },
    });
    if (!paiement) throw new ServiceError(404, "Paiement introuvable.", "introuvable.paiement");

    // The line's row lock is taken *before* the payments are summed. Recomputing
    // from what survives is only safe against a concurrent `recordPaiement` if
    // nothing can commit between that read and the write below: under Read
    // Committed the aggregate sees a snapshot, so a payment committing in that
    // window used to be erased from the balance while its row — and its receipt
    // — survived. `recordPaiement` takes the same lock through its guarded
    // update, so the two now serialize on this line. `montantDu` is not re-read:
    // it is frozen by publication, which a payment presupposes.
    await tx.$queryRaw`SELECT id FROM facture_locataire WHERE id = ${paiement.ligne.id}::uuid FOR UPDATE`;

    const { count } = await tx.paiement.deleteMany({ where: { id: paiementId } });
    if (count === 0) throw new ServiceError(409, "Paiement déjà annulé.", "paiement.dejaAnnule");

    // Recomputed from what is left rather than subtracted from a figure read
    // earlier: any concurrent payment on the same line stays accounted for.
    const reste = await tx.paiement.aggregate({
      where: { factureLocataireId: paiement.ligne.id },
      _sum: { montant: true },
    });
    const montantPaye = reste._sum.montant ?? 0n;
    const solde = montantPaye >= paiement.ligne.montantDu;

    await tx.factureLocataire.update({
      where: { id: paiement.ligne.id },
      data: {
        montantPaye,
        // An overdue line stays overdue — cancelling a payment cannot move a
        // deadline. Otherwise back to "partiel" or "en attente"; the due-date
        // job flags it again if the deadline has since passed.
        statut:
          solde
            ? "paye"
            : paiement.ligne.statut === "retard"
              ? "retard"
              : montantPaye > 0n
                ? "partiel"
                : "en_attente",
        datePaiement: solde ? new Date() : null,
      },
    });

    return {
      ok: true,
      ligneId: paiement.ligne.id,
      montantAnnule: Number(paiement.montant),
      montantPaye: Number(montantPaye),
    };
  });
}

/**
 * Generates a payment's PDF receipt (design §5.2).
 *
 * Access is settled before anything is rendered: Admin, Bailleur, or the tenant
 * the payment belongs to.
 */
export async function getRecuPdf(
  paiementId: string,
  requester: { sub: string; role: Role },
): Promise<{ pdf: Buffer; filename: string }> {
  const paiement = await prisma.paiement.findUnique({
    where: { id: paiementId },
    include: {
      recordedBy: { select: { fullName: true } },
      ligne: {
        include: {
          locataire: { select: { id: true, fullName: true } },
          facture: { select: { type: true, mois: true } },
        },
      },
    },
  });

  const gestionnaire = requester.role === "admin" || requester.role === "bailleur";
  // A missing payment and someone else's payment answer alike, so the endpoint
  // cannot be used to probe what exists on other accounts.
  if (!paiement || (!gestionnaire && paiement.ligne.locataire.id !== requester.sub)) {
    throw new ServiceError(404, "Paiement introuvable.", "introuvable.paiement");
  }

  const { ligne } = paiement;
  const data: RecuData = {
    paiementId: paiement.id,
    date: paiement.createdAt,
    montant: Number(paiement.montant),
    mode: paiement.mode,
    reference: paiement.reference,
    locataire: ligne.locataire.fullName,
    factureType: ligne.facture.type,
    factureMois: ligne.facture.mois,
    montantDu: Number(ligne.montantDu),
    montantPayeCumule: Number(ligne.montantPaye),
    encaissePar: paiement.recordedBy.fullName,
  };

  return {
    pdf: paiementRecuPdf(data),
    filename: `recu-${paiement.id.slice(0, 8)}.pdf`,
  };
}
