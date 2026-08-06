import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { paiementRecuPdf, type RecuData } from "@/lib/pdf";
import type { PaiementInput } from "@campusgest/shared";

/**
 * Records a payment (full or partial) against an invoice line.
 * Recomputes `montantPaye` and the status (partiel / paye), and sets the
 * payment date once the balance is fully settled.
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
 * Generates a payment's PDF receipt (design §5.2).
 * Also returns `locataireId` for the route-level access check
 * (Admin, Bailleur, or the tenant who owns the line).
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
