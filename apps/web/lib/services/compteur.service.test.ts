import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => ({
  compteur: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

import {
  createCompteur,
  updateCompteur,
  deleteCompteur,
} from "./compteur.service";

const compteur = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  type: "eau" as const,
  libelle: "Compteur général",
  scope: "cite" as const,
  dernierIndex: 1_200n,
  _count: { factures: 0, chambres: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.compteur.findFirst.mockResolvedValue(null);
  prisma.compteur.findUnique.mockResolvedValue(compteur());
  prisma.compteur.create.mockResolvedValue(compteur());
  prisma.compteur.update.mockResolvedValue(compteur());
});

describe("createCompteur", () => {
  it("stores the reading as a BigInt", async () => {
    await createCompteur({
      type: "electricite",
      libelle: "Bloc A",
      scope: "bloc",
      dernierIndex: 4_530,
    });
    expect(prisma.compteur.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dernierIndex: 4_530n, scope: "bloc" }),
      }),
    );
  });

  it("refuses a label already used by a meter of the same type", async () => {
    prisma.compteur.findFirst.mockResolvedValue({ id: "c-9" });
    await expect(
      createCompteur({ type: "eau", libelle: "Bloc A", scope: "bloc", dernierIndex: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.compteur.create).not.toHaveBeenCalled();
  });
});

describe("updateCompteur", () => {
  it("404s on an unknown meter", async () => {
    prisma.compteur.findUnique.mockResolvedValue(null);
    await expect(updateCompteur("c-x", { libelle: "Bloc B" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("only writes the fields that were sent", async () => {
    await updateCompteur("c-1", { dernierIndex: 1_450 });
    expect(prisma.compteur.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: { dernierIndex: 1_450n } }),
    );
  });

  it("checks the new label against the meter's own type, itself excepted", async () => {
    await updateCompteur("c-1", { libelle: "Bloc B" });
    expect(prisma.compteur.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "eau", id: { not: "c-1" } }),
      }),
    );
  });
});

describe("deleteCompteur", () => {
  it("keeps a meter an invoice was raised against", async () => {
    prisma.compteur.findUnique.mockResolvedValue(
      compteur({ _count: { factures: 2, chambres: 0 } }),
    );
    await expect(deleteCompteur("c-1")).rejects.toMatchObject({ status: 409 });
    expect(prisma.compteur.delete).not.toHaveBeenCalled();
  });

  it("keeps a meter a room bills its electricity on", async () => {
    prisma.compteur.findUnique.mockResolvedValue(
      compteur({ _count: { factures: 0, chambres: 3 } }),
    );
    await expect(deleteCompteur("c-1")).rejects.toMatchObject({ status: 409 });
  });

  it("deletes a meter nothing points at", async () => {
    await expect(deleteCompteur("c-1")).resolves.toEqual({ ok: true });
    expect(prisma.compteur.delete).toHaveBeenCalledWith({ where: { id: "c-1" } });
  });
});
