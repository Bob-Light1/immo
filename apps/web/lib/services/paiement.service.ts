import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { paiementRecuPdf, type RecuData } from "@/lib/pdf";
import type { PaiementInput } from "@campusgest/shared";

/**
 * Enregistre un paiement (total ou partiel) sur une ligne de facture.
 * Recalcule `montantPaye` et le statut (partiel / paye), et fixe la date
 * de paiement lorsque le solde est entièrement réglé.
 */
export async function recordPaiement(adminId: string, input: PaiementInput) {
  const ligne = await prisma.factureLocataire.findUnique({
    where: { id: input.factureLocataireId },
    include: { facture: { select: { statutPub: true } } },
  });
  if (!ligne) throw new ServiceError(404, "Ligne de facture introuvable.");
  if (ligne.facture.statutPub !== "publiee") {
    throw new ServiceError(409, "Impossible d'encaisser : facture non publiée.");
  }

  const montant = BigInt(input.montant);
  const reste = ligne.montantDu - ligne.montantPaye;
  if (montant > reste) {
    throw new ServiceError(400, `Le montant dépasse le solde restant (${reste} XAF).`);
  }

  const nouveauPaye = ligne.montantPaye + montant;
  const solde = nouveauPaye >= ligne.montantDu;

  const [paiement] = await prisma.$transaction([
    prisma.paiement.create({
      data: {
        factureLocataireId: ligne.id,
        montant,
        mode: input.mode,
        reference: input.reference ?? null,
        justificatifUrl: input.justificatifUrl ?? null,
        recordedById: adminId,
      },
    }),
    prisma.factureLocataire.update({
      where: { id: ligne.id },
      data: {
        montantPaye: nouveauPaye,
        statut: solde ? "paye" : "partiel",
        datePaiement: solde ? new Date() : null,
      },
    }),
  ]);

  return paiement;
}

/**
 * Génère le reçu PDF d'un paiement (conception §5.2).
 * Renvoie aussi `locataireId` pour la vérification d'accès côté route
 * (Admin, Bailleur ou le locataire propriétaire de la ligne).
 */
export async function getRecuPdf(
  paiementId: string,
): Promise<{ pdf: Buffer; locataireId: string; filename: string }> {
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
  if (!paiement) throw new ServiceError(404, "Paiement introuvable.");

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
    locataireId: ligne.locataire.id,
    filename: `recu-${paiement.id.slice(0, 8)}.pdf`,
  };
}
