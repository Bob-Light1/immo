import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => ({
  chambre: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  compteur: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

import {
  createChambre,
  updateChambre,
  deleteChambre,
  assignerChambre,
} from "./chambre.service";

const chambre = (over: Record<string, unknown> = {}) => ({
  id: "ch-1",
  bloc: "A",
  numero: "12",
  capacite: 2,
  loyerAnnuel: 240_000n,
  isActive: true,
  compteurElecId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.chambre.findFirst.mockResolvedValue(null);
  prisma.chambre.findUnique.mockResolvedValue(chambre());
  prisma.chambre.create.mockResolvedValue(chambre());
  prisma.chambre.update.mockResolvedValue(chambre());
  prisma.user.count.mockResolvedValue(0);
  prisma.user.findUnique.mockResolvedValue({ id: "u-1", role: "locataire", roomId: null });
  prisma.user.update.mockResolvedValue({ id: "u-1", roomId: "ch-1" });
  prisma.compteur.findUnique.mockResolvedValue({ type: "electricite" });
});

describe("createChambre", () => {
  it("stocke le loyer annuel en BigInt", async () => {
    await createChambre({ bloc: "B", numero: "3", capacite: 1, loyerAnnuel: 300_000 });

    expect(prisma.chambre.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loyerAnnuel: 300_000n, bloc: "B" }),
      }),
    );
  });

  it("accepte une chambre encore sans tarif", async () => {
    // 0 is the stored "not priced yet": the rent invoice asks for the amount
    // rather than billing the room at nothing.
    await createChambre({ bloc: "B", numero: "4", capacite: 1, loyerAnnuel: 0 });

    const [{ data }] = prisma.chambre.create.mock.calls[0]!;
    expect(data.loyerAnnuel).toBe(0n);
  });

  it("refuse un numéro déjà pris dans le même bloc", async () => {
    prisma.chambre.findFirst.mockResolvedValue({ id: "ch-9" });

    await expect(
      createChambre({ bloc: "A", numero: "12", capacite: 1, loyerAnnuel: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.chambre.create).not.toHaveBeenCalled();
  });

  it("refuse un compteur d'eau comme compteur électrique de la chambre", async () => {
    prisma.compteur.findUnique.mockResolvedValue({ type: "eau" });

    await expect(
      createChambre({
        bloc: "A",
        numero: "13",
        capacite: 1,
        loyerAnnuel: 0,
        compteurElecId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("updateChambre", () => {
  it("revalorise le loyer sans toucher au reste de la chambre", async () => {
    await updateChambre("ch-1", { loyerAnnuel: 264_000 });

    const [{ data }] = prisma.chambre.update.mock.calls[0]!;
    expect(data).toEqual({ loyerAnnuel: 264_000n });
  });

  it("refuse de retirer du service une chambre occupée", async () => {
    prisma.user.count.mockResolvedValue(2);

    await expect(updateChambre("ch-1", { isActive: false })).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.chambre.update).not.toHaveBeenCalled();
  });

  it("refuse une capacité inférieure au nombre d'occupants", async () => {
    prisma.user.count.mockResolvedValue(2);

    await expect(updateChambre("ch-1", { capacite: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("signale une chambre inexistante en 404", async () => {
    prisma.chambre.findUnique.mockResolvedValue(null);

    await expect(updateChambre("ch-1", { loyerAnnuel: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deleteChambre", () => {
  it("refuse de supprimer une chambre habitée", async () => {
    // `User.roomId` is what says where a resident lives: cutting the link on
    // delete would silently unhouse them.
    prisma.chambre.findUnique.mockResolvedValue({ ...chambre(), _count: { occupants: 1 } });

    await expect(deleteChambre("ch-1")).rejects.toMatchObject({ status: 409 });
    expect(prisma.chambre.delete).not.toHaveBeenCalled();
  });

  it("supprime une chambre vide", async () => {
    prisma.chambre.findUnique.mockResolvedValue({ ...chambre(), _count: { occupants: 0 } });

    await expect(deleteChambre("ch-1")).resolves.toEqual({ ok: true });
    expect(prisma.chambre.delete).toHaveBeenCalled();
  });
});

describe("assignerChambre", () => {
  it("installe un locataire dans une chambre libre", async () => {
    await assignerChambre("u-1", "ch-1");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roomId: "ch-1" } }),
    );
  });

  it("refuse une chambre complète", async () => {
    prisma.user.count.mockResolvedValue(2);

    await expect(assignerChambre("u-1", "ch-1")).rejects.toMatchObject({ status: 409 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("refuse une chambre retirée du service", async () => {
    prisma.chambre.findUnique.mockResolvedValue(chambre({ isActive: false }));

    await expect(assignerChambre("u-1", "ch-1")).rejects.toMatchObject({ status: 409 });
  });

  it("n'attribue une chambre qu'à un locataire", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u-2", role: "bailleur", roomId: null });

    await expect(assignerChambre("u-2", "ch-1")).rejects.toMatchObject({ status: 400 });
  });

  it("laisse un locataire dans sa chambre déjà pleine", async () => {
    // They are one of the occupants filling it: re-saving their own row must
    // not be read as one more person moving in.
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", role: "locataire", roomId: "ch-1" });
    prisma.user.count.mockResolvedValue(2);

    await expect(assignerChambre("u-1", "ch-1")).resolves.toBeDefined();
  });

  it("sort un locataire de sa chambre sans autre contrôle", async () => {
    await assignerChambre("u-1", null);

    expect(prisma.chambre.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roomId: null } }),
    );
  });
});
