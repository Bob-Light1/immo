// Pure calculation logic (independently testable) — the financial core.
// See design document §5.1 and §5.11.

import { moisDe } from "./dates";
import type { ErrorCode } from "./errors";

/**
 * Invalid input reaching a calculation. Carries an HTTP status so the API layer
 * can answer 400 instead of a blanket 500: these functions are also called with
 * values read back from the database (publication, roll-over job), where Zod
 * has no say. `code` lets the interface translate it — see `errors.ts`.
 */
export class CalculationError extends Error {
  readonly status = 400;

  constructor(
    message: string,
    public code?: ErrorCode,
  ) {
    super(message);
  }
}

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
 * Splits a total amount across tenants according to their coefficients, using
 * the largest-remainder method: each line gets `floor(total × coeff / Σcoeff)`,
 * then the leftover XAF are handed out one by one to the lines with the largest
 * discarded fraction.
 *
 * Guarantees `Σ(montantDu) === montantTotal` exactly, and — unlike heaping the
 * whole rounding delta onto one line — keeps every line within 1 XAF of its
 * exact share, so no tenant can be handed a difference they cannot be given a
 * reason for. Ties are broken by input order, which callers must therefore make
 * deterministic (see the `orderBy` clauses in facture.service).
 */
export function repartirFacture(
  montantTotal: number,
  coeffs: CoeffEntry[],
): RepartitionResult {
  if (coeffs.length === 0) {
    throw new CalculationError("Aucun locataire rattaché à la facture.", "calcul.aucunLocataire");
  }
  if (!Number.isInteger(montantTotal) || montantTotal < 0) {
    throw new CalculationError(
      "Le montant total doit être un entier positif (XAF, sans centimes).",
      "calcul.montantTotalInvalide",
    );
  }
  const sommeCoeff = coeffs.reduce((s, c) => s + c.coefficient, 0);
  if (sommeCoeff <= 0) {
    throw new CalculationError(
      "La somme des coefficients doit être strictement positive.",
      "calcul.sommeCoeffInvalide",
    );
  }

  const exacts = coeffs.map((c) => (montantTotal * c.coefficient) / sommeCoeff);
  const lignes: RepartitionLigne[] = coeffs.map((c, i) => ({
    locataireId: c.locataireId,
    coefficient: c.coefficient,
    montantDu: Math.floor(exacts[i]!),
  }));

  // Hand the leftover units to the largest discarded fractions first. Floating
  // point can push an exact integer share just under its floor; such a line
  // then carries a ~0.999 fraction and is served first, which restores it.
  let reste = montantTotal - lignes.reduce((s, l) => s + l.montantDu, 0);
  if (reste > 0) {
    const ordre = lignes
      .map((_, i) => i)
      .sort((a, b) => {
        const fa = exacts[a]! - Math.floor(exacts[a]!);
        const fb = exacts[b]! - Math.floor(exacts[b]!);
        return fb - fa || a - b;
      });
    for (let k = 0; k < reste; k++) {
      lignes[ordre[k % ordre.length]!]!.montantDu += 1;
    }
  }

  // Amount owed for a coefficient of 1 — a display figure, never a divisor.
  const baseUnitaire = Math.round(montantTotal / sommeCoeff);
  return { sommeCoeff, baseUnitaire, lignes };
}

/**
 * Reference rent of a "Loyer" invoice, stored as its `baseUnitaire`.
 *
 * Each tenant's rent is its own figure — rooms are not priced alike — so a
 * single reference only exists while every line agrees. `0` reports "varies per
 * tenant", and is also what tells the service it has no rent to hand a tenant
 * attached to the draft later: it must be stated rather than guessed.
 */
export function baseLoyer(montants: number[]): number {
  if (montants.length === 0) return 0;
  const premier = montants[0]!;
  return montants.every((m) => m === premier) ? premier : 0;
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
 * residence, yet each tenant needs to know what *they* will owe.
 *
 * The share follows the same rule as a real invoice — proportional to the
 * tenant's coefficient over the sum of coefficients — otherwise a tenant billed
 * at coefficient 2 would be shown half of what they are about to be charged.
 * With every coefficient at 1, `sommeCoeff` is the tenant count and the split is
 * even, as when an invoice is created. `null` when there is nothing to split by.
 */
export function partEstimee(
  montantTotal: number,
  sommeCoeff: number,
  coefficient = 1,
): number | null {
  if (sommeCoeff <= 0 || coefficient <= 0) return null;
  return Math.round((montantTotal * coefficient) / sommeCoeff);
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
