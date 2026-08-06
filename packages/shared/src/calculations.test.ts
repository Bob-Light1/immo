import { describe, it, expect } from "vitest";
import { repartirFacture, estimerCharge, partEstimee, suiviLoyer } from "./calculations";
import { isLoyer } from "./types";

describe("repartirFacture", () => {
  it("répartit l'exemple du doc (60 000, coeffs 1/1/0.5/1.5)", () => {
    const r = repartirFacture(60_000, [
      { locataireId: "a", coefficient: 1 },
      { locataireId: "b", coefficient: 1 },
      { locataireId: "c", coefficient: 0.5 },
      { locataireId: "d", coefficient: 1.5 },
    ]);
    expect(r.sommeCoeff).toBe(4);
    expect(r.baseUnitaire).toBe(15_000);
    expect(r.lignes.map((l) => l.montantDu)).toEqual([15_000, 15_000, 7_500, 22_500]);
  });

  it("garantit Σ(montantDu) === montantTotal malgré les arrondis (10 000 / 3)", () => {
    const r = repartirFacture(10_000, [
      { locataireId: "a", coefficient: 1 },
      { locataireId: "b", coefficient: 1 },
      { locataireId: "c", coefficient: 1 },
    ]);
    const total = r.lignes.reduce((s, l) => s + l.montantDu, 0);
    expect(total).toBe(10_000);
    // base = round(3333.33) = 3333; the delta (+1) lands on the last line
    expect(r.lignes.map((l) => l.montantDu)).toEqual([3_333, 3_333, 3_334]);
  });

  it("tous à n=1 : répartition égale exacte", () => {
    const r = repartirFacture(100_000, [
      { locataireId: "a", coefficient: 1 },
      { locataireId: "b", coefficient: 1 },
      { locataireId: "c", coefficient: 1 },
      { locataireId: "d", coefficient: 1 },
    ]);
    expect(r.lignes.every((l) => l.montantDu === 25_000)).toBe(true);
  });

  it("réconcilie l'écart même avec des coefficients fractionnaires", () => {
    const r = repartirFacture(50_000, [
      { locataireId: "a", coefficient: 0.7 },
      { locataireId: "b", coefficient: 1.3 },
      { locataireId: "c", coefficient: 1 },
    ]);
    const total = r.lignes.reduce((s, l) => s + l.montantDu, 0);
    expect(total).toBe(50_000);
  });

  it("lève une erreur si aucun locataire", () => {
    expect(() => repartirFacture(1_000, [])).toThrow();
  });

  it("lève une erreur si la somme des coefficients est nulle", () => {
    expect(() =>
      repartirFacture(1_000, [{ locataireId: "a", coefficient: 0 }]),
    ).toThrow();
  });
});

describe("estimerCharge", () => {
  it("applique (I × P) + TVA + LC + T", () => {
    expect(
      estimerCharge({ indiceDiff: 100, prixUnit: 85, tva: 500, locCompteur: 1_000, transport: 2_000 }),
    ).toBe(12_000);
  });

  it("traite les paramètres manquants comme 0", () => {
    expect(estimerCharge({ indiceDiff: 10, prixUnit: 50 })).toBe(500);
    expect(estimerCharge({})).toBe(0);
  });
});

describe("partEstimee", () => {
  it("répartit l'estimation à parts égales entre locataires actifs", () => {
    expect(partEstimee(60_000, 4)).toBe(15_000);
    expect(partEstimee(10_000, 3)).toBe(3_333);
  });

  it("renvoie null quand aucun locataire actif", () => {
    expect(partEstimee(60_000, 0)).toBeNull();
  });
});

describe("suiviLoyer", () => {
  const ref = new Date(2026, 7, 15); // August 2026

  it("distingue le versé du mois, le cumul de l'année et le restant", () => {
    const s = suiviLoyer({
      montantAnnuel: 240_000,
      montantPaye: 70_000,
      paiements: [
        { montant: 50_000, date: new Date(2026, 6, 3) }, // July
        { montant: 20_000, date: new Date(2026, 7, 2) }, // August
      ],
      reference: ref,
    });
    expect(s).toEqual({ payeCeMois: 20_000, payeAnnee: 70_000, restantAnnee: 170_000 });
  });

  it("accepte des dates sérialisées (ISO) et cumule les versements du mois", () => {
    const s = suiviLoyer({
      montantAnnuel: 240_000,
      montantPaye: 30_000,
      paiements: [
        { montant: 10_000, date: new Date(2026, 7, 1).toISOString() },
        { montant: 20_000, date: new Date(2026, 7, 20).toISOString() },
      ],
      reference: ref,
    });
    expect(s.payeCeMois).toBe(30_000);
  });

  it("ne descend jamais sous zéro sur le restant (loyer soldé)", () => {
    const s = suiviLoyer({
      montantAnnuel: 240_000,
      montantPaye: 240_000,
      paiements: [],
      reference: ref,
    });
    expect(s.restantAnnee).toBe(0);
    expect(s.payeCeMois).toBe(0);
  });
});

describe("isLoyer", () => {
  it("reconnaît le type quelle que soit la casse ou les accents", () => {
    expect(isLoyer("Loyer")).toBe(true);
    expect(isLoyer(" loyer ")).toBe(true);
    expect(isLoyer("LOYÉR")).toBe(true);
    expect(isLoyer("Hébergement")).toBe(false);
    expect(isLoyer("Eau")).toBe(false);
  });
});
