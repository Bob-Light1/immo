// Logique de calcul pure (testable isolément) — cœur financier.
// Voir document de conception §5.1 et §5.11.

export interface CoeffEntry {
  locataireId: string;
  coefficient: number;
}

export interface RepartitionLigne {
  locataireId: string;
  coefficient: number;
  montantDu: number;
}

export interface RepartitionResult {
  sommeCoeff: number;
  baseUnitaire: number;
  lignes: RepartitionLigne[];
}

/**
 * Répartit un montant total entre locataires selon leurs coefficients.
 *  base = montantTotal / Σ(coeff) ; montant(i) = round(base × coeff_i).
 * L'écart d'arrondi est reporté sur la dernière ligne pour garantir
 * Σ(montantDu) === montantTotal (réconciliation exacte).
 */
export function repartirFacture(
  montantTotal: number,
  coeffs: CoeffEntry[],
): RepartitionResult {
  if (coeffs.length === 0) {
    throw new Error("Aucun locataire rattaché à la facture.");
  }
  const sommeCoeff = coeffs.reduce((s, c) => s + c.coefficient, 0);
  if (sommeCoeff <= 0) {
    throw new Error("La somme des coefficients doit être strictement positive.");
  }

  const baseUnitaire = Math.round(montantTotal / sommeCoeff);

  const lignes: RepartitionLigne[] = coeffs.map((c) => ({
    locataireId: c.locataireId,
    coefficient: c.coefficient,
    montantDu: Math.round(baseUnitaire * c.coefficient),
  }));

  // Réconciliation de l'écart d'arrondi sur la dernière ligne.
  const total = lignes.reduce((s, l) => s + l.montantDu, 0);
  const ecart = montantTotal - total;
  if (ecart !== 0 && lignes.length > 0) {
    lignes[lignes.length - 1]!.montantDu += ecart;
  }

  return { sommeCoeff, baseUnitaire, lignes };
}

export interface PredictionParams {
  indiceDiff?: number; // I (kWh ou m³)
  prixUnit?: number; // P
  tva?: number;
  locCompteur?: number; // LC
  transport?: number; // T
}

/** Estimation électricité : (I × P) + TVA + LC + T. */
export function estimerCharge(p: PredictionParams): number {
  const i = p.indiceDiff ?? 0;
  const prix = p.prixUnit ?? 0;
  return Math.round(i * prix + (p.tva ?? 0) + (p.locCompteur ?? 0) + (p.transport ?? 0));
}
