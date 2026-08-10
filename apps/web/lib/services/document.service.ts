import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { DocumentInput, Role } from "@campusgest/shared";
import { notifyAllActive, notifyUsers } from "./notification.service";

/**
 * Shared documents (design §5.15): rules, contracts, guides…
 * The Admin uploads a file (mandatory) and picks the roles allowed to see it.
 * Visibility: an empty or missing `visibleRoles` means everyone.
 */

function isVisible(visibleRoles: unknown, role: Role): boolean {
  const roles = visibleRoles as string[] | null;
  return !roles || roles.length === 0 || roles.includes(role);
}

interface DocRow {
  id: string;
  titre: string;
  fichierUrl: string;
  categorie: string;
  visibleRoles: unknown;
  createdAt: Date;
  uploadedBy: { fullName: string };
}

function toDto(d: DocRow) {
  return {
    id: d.id,
    titre: d.titre,
    fichierUrl: d.fichierUrl,
    categorie: d.categorie,
    visibleRoles: (d.visibleRoles as string[] | null) ?? [],
    uploadeur: d.uploadedBy.fullName,
    createdAt: d.createdAt,
  };
}

export async function createDocument(uploaderId: string, input: DocumentInput) {
  const doc = await prisma.document.create({
    data: {
      titre: input.titre,
      fichierUrl: input.fichierUrl,
      categorie: input.categorie,
      visibleRoles: input.visibleRoles ?? undefined,
      uploadedById: uploaderId,
    },
    include: { uploadedBy: { select: { fullName: true } } },
  });

  // Notify the relevant recipients (everyone, or the targeted roles).
  const content = { key: "document.nouveau" as const, params: { titre: input.titre } };
  const roles = input.visibleRoles;
  if (!roles || roles.length === 0) {
    await notifyAllActive("systeme", content);
  } else {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: roles } },
      select: { id: true },
    });
    await notifyUsers(
      users.map((u) => u.id),
      "systeme",
      content,
    );
  }
  return toDto(doc);
}

export async function listDocuments(
  role: Role,
  pagination: { page: number; limit: number },
  isAdmin: boolean,
  filters: { q?: string; categorie?: string } = {},
) {
  const q = filters.q?.trim().toLowerCase();
  const all = await prisma.document.findMany({
    where: filters.categorie ? { categorie: filters.categorie } : {},
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { fullName: true } } },
  });
  const roleVisible = isAdmin ? all : all.filter((d) => isVisible(d.visibleRoles, role));
  const visible = q ? roleVisible.filter((d) => d.titre.toLowerCase().includes(q)) : roleVisible;
  const items = visible.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit,
  );
  return { items: items.map(toDto), total: visible.length, page: pagination.page, limit: pagination.limit };
}

export async function deleteDocument(id: string) {
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Document introuvable.", "introuvable.document");
  await prisma.document.delete({ where: { id } });
}
