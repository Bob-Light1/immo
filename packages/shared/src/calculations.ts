// Pure calculation logic (independently testable) — the financial core.
// See design document §5.1 and §5.11.

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
 * Splits a total amount across tenants according to their coefficients.
 *  base = montantTotal / Σ(coeff); amount(i) = round(base × coeff_i).
 * The rounding delta is carried onto the last line so that
 * Σ(montantDu) === montantTotal holds exactly.
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

  // Reconcile the rounding delta on the last line.
  const total = lignes.reduce((s, l) => s + l.montantDu, 0);
  const ecart = montantTotal - total;
  if (ecart !== 0 && lignes.length > 0) {
    lignes[lignes.length - 1]!.montantDu += ecart;
  }

  return { sommeCoeff, baseUnitaire, lignes };
}

export interface PredictionParams {
  indiceDiff?: number; // I (kWh or m³)
  prixUnit?: number; // P
  tva?: number;
  locCompteur?: number; // LC
  transport?: number; // T
}

/** Electricity estimate: (I × P) + VAT + LC + T. */
export function estimerCharge(p: PredictionParams): number {
  const i = p.indiceDiff ?? 0;
  const prix = p.prixUnit ?? 0;
  return Math.round(i * prix + (p.tva ?? 0) + (p.locCompteur ?? 0) + (p.transport ?? 0));
}

/**
 * Individual share of an estimate: the announced amount covers the whole
 * residence, yet each tenant needs to know what they will personally owe.
 * Split evenly (coefficient 1 by default, as when an invoice is created).
 * `null` when there is no active tenant.
 */
export function partEstimee(montantTotal: number, nbLocataires: number): number | null {
  if (nbLocataires <= 0) return null;
  return Math.round(montantTotal / nbLocataires);
}

export interface PaiementDate {
  montant: number;
  date: Date | string;
}

export interface SuiviLoyer {
  /** Amount paid over the reference month (current calendar month). */
  payeCeMois: number;
  /** Total already paid for the year covered by the invoice. */
  payeAnnee: number;
  /** Balance left to pay before the end of the covered year. */
  restantAnnee: number;
}

/** "2026-08" from a date (local components). */
function moisDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Annual rent tracking ("Loyer" invoice). The line carries the amount due for
 * the whole year: payments are charged against it month after month, and the
 * three figures reported to the tenant, the Admin and the Bailleur after each
 * payment are derived from history — no extra state to maintain.
 */
export function suiviLoyer(input: {
  montantAnnuel: number;
  montantPaye: number;
  paiements: PaiementDate[];
  reference?: Date;
}): SuiviLoyer {
  const moisRef = moisDe(input.reference ?? new Date());
  const payeCeMois = input.paiements
    .filter((p) => moisDe(typeof p.date === "string" ? new Date(p.date) : p.date) === moisRef)
    .reduce((s, p) => s + p.montant, 0);

  return {
    payeCeMois,
    payeAnnee: input.montantPaye,
    restantAnnee: Math.max(0, input.montantAnnuel - input.montantPaye),
  };
}
