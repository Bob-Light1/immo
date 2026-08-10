import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma is mocked: what these tests pin down is the *sequencing* of the calls
// (guarded update, recompute from what survives), which is where the money
// invariants actually live.
const prisma = vi.hoisted(() => {
  const client = {
    factureLocataire: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    paiement: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn() },
    // Row lock taken by cancelPaiement before it sums what survives.
    $queryRaw: vi.fn(async () => []),
    // Both call styles are used across the services.
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(client)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return client;
});

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/pdf", () => ({
  paiementRecuPdf: vi.fn(() => Buffer.from("pdf")),
}));

import { paiementRecuPdf } from "@/lib/pdf";
import { recordPaiement, cancelPaiement, getRecuPdf } from "./paiement.service";
import { ServiceError } from "@/lib/api";

const ADMIN = "admin-1";

/** A published line of 10 000 XAF with `paye` already collected. */
function ligne(paye: bigint, montantDu = 10_000n) {
  return {
    id: "ligne-1",
    montantDu,
    montantPaye: paye,
    facture: { statutPub: "publiee" },
  };
}

const paiementInput = {
  factureLocataireId: "ligne-1",
  montant: 4_000,
  mode: "especes" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.paiement.create.mockResolvedValue({ id: "p-1" });
  prisma.factureLocataire.updateMany.mockResolvedValue({ count: 1 });
});

describe("recordPaiement", () => {
  it("refuse d'encaisser sur une facture non publiée", async () => {
    prisma.factureLocataire.findUnique.mockResolvedValue({
      ...ligne(0n),
      facture: { statutPub: "brouillon" },
    });

    await expect(recordPaiement(ADMIN, paiementInput)).rejects.toMatchObject({ status: 409 });
    expect(prisma.paiement.create).not.toHaveBeenCalled();
  });

  it("refuse un montant supérieur au solde restant", async () => {
    prisma.factureLocataire.findUnique.mockResolvedValue(ligne(8_000n));

    await expect(
      recordPaiement(ADMIN, { ...paiementInput, montant: 4_000 }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(prisma.paiement.create).not.toHaveBeenCalled();
  });

  it("incrémente le solde sous garde optimiste plutôt que de l'écraser", async () => {
    prisma.factureLocataire.findUnique.mockResolvedValue(ligne(2_000n));

    await recordPaiement(ADMIN, paiementInput);

    const [{ where, data }] = prisma.factureLocataire.updateMany.mock.calls[0]!;
    // Guarded on the balance that was read: a payment committed in between
    // makes this match nothing.
    expect(where).toMatchObject({ id: "ligne-1", montantPaye: 2_000n });
    // Incremented, never assigned — an assignment is what used to lose the
    // concurrent payment.
    expect(data.montantPaye).toEqual({ increment: 4_000n });
    expect(data.statut).toBe("partiel");
    expect(data.datePaiement).toBeNull();
  });

  it("solde la ligne et date le paiement quand le reste est couvert", async () => {
    prisma.factureLocataire.findUnique.mockResolvedValue(ligne(6_000n));

    await recordPaiement(ADMIN, paiementInput);

    const [{ data }] = prisma.factureLocataire.updateMany.mock.calls[0]!;
    expect(data.statut).toBe("paye");
    expect(data.datePaiement).toBeInstanceOf(Date);
  });

  it("laisse une ligne en retard en retard après un versement partiel", async () => {
    // A part payment moves no deadline. Overwriting the status cleared the
    // overdue flag until the next daily run of the due-date job.
    prisma.factureLocataire.findUnique.mockResolvedValue({ ...ligne(2_000n), statut: "retard" });

    await recordPaiement(ADMIN, paiementInput);

    const [{ data }] = prisma.factureLocataire.updateMany.mock.calls[0]!;
    expect(data.statut).toBe("retard");
  });

  it("rejette l'encaissement perdant d'une course sans créer de paiement", async () => {
    prisma.factureLocataire.findUnique.mockResolvedValue(ligne(2_000n));
    // Another cashier committed between the read and the write.
    prisma.factureLocataire.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordPaiement(ADMIN, paiementInput)).rejects.toMatchObject({ status: 409 });
    // The row must not exist: a receipt for money absent from the balance is
    // exactly the failure this guards against.
    expect(prisma.paiement.create).not.toHaveBeenCalled();
  });
});

describe("cancelPaiement", () => {
  beforeEach(() => {
    prisma.paiement.findUnique.mockResolvedValue({
      id: "p-1",
      montant: 4_000n,
      ligne: { id: "ligne-1", montantDu: 10_000n, montantPaye: 6_000n },
    });
    prisma.paiement.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("recalcule le solde à partir des paiements restants", async () => {
    // Recomputed rather than subtracted, so a concurrent payment stays counted.
    prisma.paiement.aggregate.mockResolvedValue({ _sum: { montant: 2_000n } });

    const res = await cancelPaiement("p-1");

    const [{ data }] = prisma.factureLocataire.update.mock.calls[0]!;
    expect(data.montantPaye).toBe(2_000n);
    expect(data.statut).toBe("partiel");
    expect(data.datePaiement).toBeNull();
    expect(res.montantAnnule).toBe(4_000);
  });

  it("repasse la ligne en attente quand plus rien n'a été versé", async () => {
    prisma.paiement.aggregate.mockResolvedValue({ _sum: { montant: null } });

    await cancelPaiement("p-1");

    const [{ data }] = prisma.factureLocataire.update.mock.calls[0]!;
    expect(data.montantPaye).toBe(0n);
    expect(data.statut).toBe("en_attente");
  });

  it("laisse une ligne en retard en retard après annulation", async () => {
    prisma.paiement.findUnique.mockResolvedValue({
      id: "p-1",
      montant: 4_000n,
      ligne: { id: "ligne-1", montantDu: 10_000n, montantPaye: 6_000n, statut: "retard" },
    });
    prisma.paiement.aggregate.mockResolvedValue({ _sum: { montant: 2_000n } });

    await cancelPaiement("p-1");

    const [{ data }] = prisma.factureLocataire.update.mock.calls[0]!;
    expect(data.statut).toBe("retard");
  });

  it("verrouille la ligne avant de recalculer le solde", async () => {
    // Without the lock, a payment committing between the sum and the write is
    // erased from the balance while its row survives. The ordering is the
    // guarantee, hence the assertion on it.
    const ordre: string[] = [];
    prisma.$queryRaw.mockImplementation(async () => {
      ordre.push("lock");
      return [];
    });
    prisma.paiement.aggregate.mockImplementation(async () => {
      ordre.push("aggregate");
      return { _sum: { montant: 2_000n } };
    });
    prisma.factureLocataire.update.mockImplementation(async () => {
      ordre.push("update");
      return {};
    });

    await cancelPaiement("p-1");

    expect(ordre).toEqual(["lock", "aggregate", "update"]);
  });

  it("échoue si le paiement n'existe pas", async () => {
    prisma.paiement.findUnique.mockResolvedValue(null);
    await expect(cancelPaiement("p-1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("getRecuPdf", () => {
  const paiement = {
    id: "p-1",
    createdAt: new Date(),
    montant: 4_000n,
    mode: "especes",
    reference: null,
    recordedBy: { fullName: "Admin" },
    ligne: {
      montantDu: 10_000n,
      montantPaye: 4_000n,
      locataire: { id: "loc-1", fullName: "Awa" },
      facture: { type: "Eau", mois: "2026-08" },
    },
  };

  it("refuse le reçu d'un autre locataire sans générer le PDF", async () => {
    prisma.paiement.findUnique.mockResolvedValue(paiement);

    await expect(
      getRecuPdf("p-1", { sub: "loc-2", role: "locataire" }),
    ).rejects.toMatchObject({ status: 404 });
    // Authorization is settled before anything is rendered.
    expect(paiementRecuPdf).not.toHaveBeenCalled();
  });

  it("répond pareil pour un paiement absent et pour celui d'autrui", async () => {
    prisma.paiement.findUnique.mockResolvedValue(null);
    // Same status and message, so the endpoint cannot be used to probe what
    // exists on other accounts.
    await expect(
      getRecuPdf("p-1", { sub: "loc-2", role: "locataire" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("sert le reçu au locataire concerné et au gestionnaire", async () => {
    prisma.paiement.findUnique.mockResolvedValue(paiement);

    await expect(getRecuPdf("p-1", { sub: "loc-1", role: "locataire" })).resolves.toMatchObject({
      filename: expect.stringContaining("recu-"),
    });
    await expect(getRecuPdf("p-1", { sub: "x", role: "bailleur" })).resolves.toBeTruthy();
  });
});
