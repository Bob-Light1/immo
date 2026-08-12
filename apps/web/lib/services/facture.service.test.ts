import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => {
  const client = {
    facture: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    factureLocataire: {
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    user: { findMany: vi.fn() },
    compteur: { findUnique: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return client;
});

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/pdf", () => ({ factureLocatairePdf: vi.fn(() => Buffer.from("pdf")) }));
vi.mock("@/lib/services/notification.service", () => ({ notifyEach: vi.fn() }));

import { notifyEach } from "@/lib/services/notification.service";
import {
  createFacture,
  updateFacture,
  deleteFacture,
  setCoefficients,
  setLoyers,
  publishFacture,
} from "./facture.service";

const ADMIN = "admin-1";

const baseInput = {
  type: "Eau",
  montantTotal: 60_000,
  mois: "2026-08",
  dateLimite: new Date("2026-08-31"),
};

function locataires(...ids: string[]) {
  return ids.map((id) => ({ id }));
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.facture.findFirst.mockResolvedValue(null);
  prisma.user.findMany.mockResolvedValue(locataires("a", "b", "c"));
  prisma.facture.create.mockResolvedValue({ id: "f-1", lignes: [] });
});

describe("createFacture", () => {
  it("normalise le type dans typeKey", async () => {
    await createFacture(ADMIN, { ...baseInput, type: " Électricité " });

    const [{ data }] = prisma.facture.create.mock.calls[0]!;
    expect(data.type).toBe(" Électricité ");
    expect(data.typeKey).toBe("electricite");
  });

  it("refuse un doublon type + mois, quelle que soit la casse", async () => {
    prisma.facture.findFirst.mockResolvedValue({ type: "Eau" });

    await expect(createFacture(ADMIN, { ...baseInput, type: "eau" })).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.facture.create).not.toHaveBeenCalled();
  });

  it("refuse une seconde facture de loyer sur la même année", async () => {
    // No (typeKey, mois) clash — the duplicate is on the *year*, which is what
    // the annual flat amount is billed against.
    prisma.facture.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ mois: "2026-01" });

    await expect(
      createFacture(ADMIN, {
        type: "Loyer",
        montantParLocataire: 240_000,
        mois: "2026-08",
        dateLimite: new Date("2027-07-31"),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.facture.create).not.toHaveBeenCalled();
  });

  it("signale les locataires sélectionnés inconnus ou désactivés", async () => {
    prisma.user.findMany.mockResolvedValue(locataires("a"));

    await expect(
      createFacture(ADMIN, { ...baseInput, locataireIds: ["a", "disparu"] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.facture.create).not.toHaveBeenCalled();
  });

  it("rejette un compteur inexistant en 400 plutôt qu'en erreur serveur", async () => {
    prisma.compteur.findUnique.mockResolvedValue(null);

    await expect(
      createFacture(ADMIN, { ...baseInput, compteurId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("porte le forfait annuel sur chaque ligne sans le diviser", async () => {
    await createFacture(ADMIN, {
      type: "Loyer",
      montantParLocataire: 240_000,
      mois: "2026-01",
      dateLimite: new Date("2026-12-31"),
    });

    const [{ data }] = prisma.facture.create.mock.calls[0]!;
    expect(data.lignes.create).toHaveLength(3);
    for (const l of data.lignes.create) expect(l.montantDu).toBe(240_000n);
    // The total is merely the sum of the flat amounts.
    expect(data.montantTotal).toBe(720_000n);
  });
});

describe("garde brouillon", () => {
  const publiee = {
    id: "f-1",
    type: "Eau",
    typeKey: "eau",
    mois: "2026-08",
    dateLimite: new Date("2026-08-31"),
    montantTotal: 60_000n,
    baseUnitaire: 20_000n,
    statutPub: "publiee",
    lignes: [],
  };

  it("refuse de modifier une facture publiée", async () => {
    prisma.facture.findUnique.mockResolvedValue(publiee);
    await expect(updateFacture("f-1", { montantTotal: 70_000 })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("refuse de supprimer une facture publiée", async () => {
    prisma.facture.findUnique.mockResolvedValue(publiee);
    await expect(deleteFacture("f-1")).rejects.toMatchObject({ status: 409 });
    expect(prisma.facture.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse des coefficients sur une facture publiée", async () => {
    prisma.facture.findUnique.mockResolvedValue(publiee);
    await expect(
      setCoefficients("f-1", { coefficients: [{ locataireId: "a", coefficient: 2 }] }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("updateFacture", () => {
  const brouillon = {
    id: "f-1",
    type: "Eau",
    typeKey: "eau",
    mois: "2026-08",
    dateLimite: new Date("2026-08-31"),
    montantTotal: 60_000n,
    baseUnitaire: 20_000n,
    statutPub: "brouillon",
    lignes: [
      { locataireId: "a", coefficient: 2 },
      { locataireId: "b", coefficient: 1 },
    ],
  };

  const loyer = {
    ...brouillon,
    type: "Loyer",
    typeKey: "loyer",
    mois: "2026-01",
    dateLimite: new Date("2026-12-31"),
    baseUnitaire: 240_000n,
    lignes: [{ locataireId: "a", coefficient: 1, montantDu: 240_000n }],
  };

  /** Rents already differentiated: no reference amount left on the invoice. */
  const loyerDifferencie = {
    ...loyer,
    montantTotal: 540_000n,
    baseUnitaire: 0n,
    lignes: [
      { locataireId: "a", coefficient: 1, montantDu: 300_000n },
      { locataireId: "b", coefficient: 1, montantDu: 240_000n },
    ],
  };

  beforeEach(() => {
    prisma.facture.findUnique.mockResolvedValue(brouillon);
  });

  it("refuse un montant par locataire sur une facture de charges", async () => {
    // Used to answer 200 with the field silently dropped, on a figure the
    // Admin believed they had corrected.
    await expect(updateFacture("f-1", { montantParLocataire: 5_000 })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.facture.update).not.toHaveBeenCalled();
  });

  it("refuse un montant total sur une facture de loyer", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyer);

    await expect(updateFacture("f-1", { montantTotal: 500_000 })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.facture.update).not.toHaveBeenCalled();
  });

  it("conserve le loyer de chaque locataire quand la facture est corrigée", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyerDifferencie);
    prisma.user.findMany.mockResolvedValue(locataires("a", "b"));

    // Correcting the deadline alone must not reprice a single room.
    await updateFacture("f-1", { dateLimite: new Date("2026-12-31") });

    const lignes = prisma.factureLocataire.upsert.mock.calls.map(([c]) => c);
    expect(lignes.map((l) => l.update.montantDu)).toEqual([300_000n, 240_000n]);
    const [{ data }] = prisma.facture.update.mock.calls[0]!;
    expect(data.montantTotal).toBe(540_000n);
    expect(data.baseUnitaire).toBe(0n);
  });

  it("réaligne tous les loyers quand un montant par locataire est fourni", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyerDifferencie);
    prisma.user.findMany.mockResolvedValue(locataires("a", "b"));

    await updateFacture("f-1", { montantParLocataire: 260_000 });

    const lignes = prisma.factureLocataire.upsert.mock.calls.map(([c]) => c);
    expect(lignes.map((l) => l.update.montantDu)).toEqual([260_000n, 260_000n]);
    const [{ data }] = prisma.facture.update.mock.calls[0]!;
    expect(data.baseUnitaire).toBe(260_000n);
  });

  it("hérite du loyer de référence pour un locataire rattaché à un loyer uniforme", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyer);
    prisma.user.findMany.mockResolvedValue(locataires("a", "b"));

    await updateFacture("f-1", { locataireIds: ["a", "b"] });

    const lignes = prisma.factureLocataire.upsert.mock.calls.map(([c]) => c);
    expect(lignes.map((l) => l.update.montantDu)).toEqual([240_000n, 240_000n]);
  });

  it("exige le loyer d'un locataire rattaché à des loyers différenciés", async () => {
    // Nothing to infer from: guessing would bill a room at another's tariff.
    prisma.facture.findUnique.mockResolvedValue(loyerDifferencie);
    prisma.user.findMany.mockResolvedValue(locataires("a", "b", "c"));

    await expect(updateFacture("f-1", { locataireIds: ["a", "b", "c"] })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.facture.update).not.toHaveBeenCalled();
  });

  it("rattache un locataire arrivé après la rédaction du brouillon", async () => {
    prisma.user.findMany.mockResolvedValue(locataires("a", "b", "c"));

    await updateFacture("f-1", { locataireIds: ["a", "b", "c"] });

    const lignes = prisma.factureLocataire.upsert.mock.calls.map(([c]) => c);
    expect(lignes.map((l) => l.where.factureId_locataireId.locataireId)).toEqual(["a", "b", "c"]);
    // Coefficients already set are kept; the newcomer starts at 1, as at creation.
    expect(lignes.map((l) => l.update.coefficient)).toEqual([2, 1, 1]);
    // The total is unchanged and redistributed over the new roster.
    const total = lignes.reduce((s: bigint, l) => s + l.update.montantDu, 0n);
    expect(total).toBe(60_000n);
  });

  it("détache un locataire retiré du brouillon", async () => {
    prisma.user.findMany.mockResolvedValue(locataires("a"));

    await updateFacture("f-1", { locataireIds: ["a"] });

    expect(prisma.factureLocataire.deleteMany).toHaveBeenCalled();
    const [{ data }] = prisma.facture.update.mock.calls[0]!;
    // The whole total now sits on the only remaining tenant.
    expect(data.montantTotal).toBe(60_000n);
    expect(prisma.factureLocataire.upsert).toHaveBeenCalledTimes(1);
  });

  it("signale un locataire inconnu ou désactivé plutôt que de l'ignorer", async () => {
    prisma.user.findMany.mockResolvedValue(locataires("a"));

    await expect(updateFacture("f-1", { locataireIds: ["a", "disparu"] })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.facture.update).not.toHaveBeenCalled();
  });
});

describe("setCoefficients", () => {
  const brouillon = {
    id: "f-1",
    type: "Eau",
    typeKey: "eau",
    mois: "2026-08",
    montantTotal: 60_000n,
    statutPub: "brouillon",
    lignes: [
      { locataireId: "a", coefficient: 1 },
      { locataireId: "b", coefficient: 1 },
    ],
  };

  it("rejette un locataire non rattaché à la facture", async () => {
    prisma.facture.findUnique.mockResolvedValue(brouillon);

    // Used to answer 200 while changing nothing.
    await expect(
      setCoefficients("f-1", { coefficients: [{ locataireId: "zz", coefficient: 2 }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.factureLocataire.update).not.toHaveBeenCalled();
  });
});

describe("setLoyers", () => {
  const loyer = {
    id: "f-1",
    type: "Loyer",
    typeKey: "loyer",
    mois: "2026-01",
    montantTotal: 720_000n,
    baseUnitaire: 240_000n,
    statutPub: "brouillon",
    lignes: [
      { locataireId: "a", coefficient: 1, montantDu: 240_000n },
      { locataireId: "b", coefficient: 1, montantDu: 240_000n },
      { locataireId: "c", coefficient: 1, montantDu: 240_000n },
    ],
  };

  it("fixe un loyer propre à chaque locataire sans toucher aux autres", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyer);

    await setLoyers("f-1", {
      loyers: [
        { locataireId: "a", montant: 300_000 },
        { locataireId: "b", montant: 180_000 },
      ],
    });

    const montants = prisma.factureLocataire.update.mock.calls.map(([c]) => c.data.montantDu);
    // The tenant left out keeps the rent already on their line.
    expect(montants).toEqual([300_000n, 180_000n, 240_000n]);
    const [{ data }] = prisma.facture.update.mock.calls[0]!;
    // Rent is never divided: the total is merely the sum of the rooms.
    expect(data.montantTotal).toBe(720_000n);
    // Rents no longer agree, so the invoice has no reference amount left.
    expect(data.baseUnitaire).toBe(0n);
  });

  it("garde une référence tant que toutes les chambres sont au même tarif", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyer);

    await setLoyers("f-1", {
      loyers: ["a", "b", "c"].map((locataireId) => ({ locataireId, montant: 260_000 })),
    });

    const [{ data }] = prisma.facture.update.mock.calls[0]!;
    expect(data.baseUnitaire).toBe(260_000n);
    expect(data.montantTotal).toBe(780_000n);
  });

  it("rejette un locataire non rattaché à la facture", async () => {
    prisma.facture.findUnique.mockResolvedValue(loyer);

    await expect(
      setLoyers("f-1", { loyers: [{ locataireId: "zz", montant: 300_000 }] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.factureLocataire.update).not.toHaveBeenCalled();
  });

  it("refuse des loyers sur une facture de charges", async () => {
    // Charges are split from a total: an amount set line by line would leave
    // the invoice total and its lines telling two different stories.
    prisma.facture.findUnique.mockResolvedValue({
      ...loyer,
      type: "Eau",
      typeKey: "eau",
    });

    await expect(
      setLoyers("f-1", { loyers: [{ locataireId: "a", montant: 300_000 }] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.factureLocataire.update).not.toHaveBeenCalled();
  });

  it("refuse des loyers sur une facture publiée", async () => {
    prisma.facture.findUnique.mockResolvedValue({ ...loyer, statutPub: "publiee" });

    await expect(
      setLoyers("f-1", { loyers: [{ locataireId: "a", montant: 300_000 }] }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("publishFacture", () => {
  it("refuse de republier et n'écrit rien", async () => {
    prisma.facture.findUnique.mockResolvedValue({
      id: "f-1",
      type: "Eau",
      statutPub: "publiee",
      montantTotal: 60_000n,
      lignes: [],
    });

    await expect(publishFacture("f-1")).rejects.toMatchObject({ status: 409 });
    expect(prisma.facture.updateMany).not.toHaveBeenCalled();
    expect(notifyEach).not.toHaveBeenCalled();
  });

  it("perd la course de publication sans notifier les locataires", async () => {
    prisma.facture.findUnique.mockResolvedValue({
      id: "f-1",
      type: "Eau",
      statutPub: "brouillon",
      montantTotal: 60_000n,
      lignes: [
        { id: "l1", locataireId: "a", coefficient: 1, montantDu: 30_000n, locataire: { isActive: true } },
        { id: "l2", locataireId: "b", coefficient: 1, montantDu: 30_000n, locataire: { isActive: true } },
      ],
    });
    // A concurrent publication committed first: the guarded update matches
    // nothing, so this one must not announce a second invoice.
    prisma.facture.updateMany.mockResolvedValue({ count: 0 });

    await expect(publishFacture("f-1")).rejects.toMatchObject({ status: 409 });
    expect(notifyEach).not.toHaveBeenCalled();
  });

  it("exclut un locataire désactivé d'un loyer sans toucher aux autres", async () => {
    // Rent is not a total to divide: the residence must not see its rents rise
    // because one resident left before publication.
    prisma.facture.findUnique.mockResolvedValue({
      id: "f-1",
      type: "Loyer",
      mois: "2026-01",
      dateLimite: new Date("2026-12-31"),
      statutPub: "brouillon",
      montantTotal: 780_000n,
      lignes: [
        { id: "l1", locataireId: "a", coefficient: 1, montantDu: 300_000n, locataire: { isActive: true } },
        { id: "l2", locataireId: "b", coefficient: 1, montantDu: 240_000n, locataire: { isActive: true } },
        { id: "l3", locataireId: "c", coefficient: 1, montantDu: 240_000n, locataire: { isActive: false } },
      ],
    });
    prisma.facture.updateMany.mockResolvedValue({ count: 1 });

    await publishFacture("f-1");

    expect(prisma.factureLocataire.update).not.toHaveBeenCalled();
    const [{ data }] = prisma.facture.updateMany.mock.calls[0]!;
    expect(data.montantTotal).toBe(540_000n);
    expect(data.baseUnitaire).toBe(0n);
  });

  it("exclut les locataires désactivés et redistribue leur part", async () => {
    prisma.facture.findUnique.mockResolvedValue({
      id: "f-1",
      type: "Eau",
      mois: "2026-08",
      dateLimite: new Date("2026-08-31"),
      statutPub: "brouillon",
      montantTotal: 60_000n,
      lignes: [
        { id: "l1", locataireId: "a", coefficient: 1, montantDu: 20_000n, locataire: { isActive: true } },
        { id: "l2", locataireId: "b", coefficient: 1, montantDu: 20_000n, locataire: { isActive: true } },
        { id: "l3", locataireId: "c", coefficient: 1, montantDu: 20_000n, locataire: { isActive: false } },
      ],
    });
    prisma.facture.updateMany.mockResolvedValue({ count: 1 });

    await publishFacture("f-1");

    expect(prisma.factureLocataire.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["l3"] } },
    });
    // The total is preserved and spread over those who remain.
    const montants = prisma.factureLocataire.update.mock.calls.map(([c]) => c.data.montantDu);
    expect(montants.reduce((s: bigint, m: bigint) => s + m, 0n)).toBe(60_000n);
  });
});
