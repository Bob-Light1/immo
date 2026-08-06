import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { PostInput } from "@campusgest/shared";
import { notifyAllActive } from "./notification.service";

/**
 * News feed / posts (design §5.9). The Admin and the Bailleur publish an item
 * together with a mandatory image; every user can read it. The Admin can hide
 * a post (moderation).
 */

interface PostRow {
  id: string;
  titre: string;
  description: string;
  imageUrl: string;
  isHidden: boolean;
  createdAt: Date;
  author: { fullName: string };
}

function toDto(p: PostRow) {
  return {
    id: p.id,
    titre: p.titre,
    description: p.description,
    imageUrl: p.imageUrl,
    isHidden: p.isHidden,
    auteur: p.author.fullName,
    createdAt: p.createdAt,
  };
}

export async function createPost(authorId: string, input: PostInput) {
  const post = await prisma.postInfo.create({
    data: {
      authorId,
      titre: input.titre,
      description: input.description,
      imageUrl: input.imageUrl,
    },
    include: { author: { select: { fullName: true } } },
  });
  // Broadcast the item to the rest of the community (in-app + push).
  await notifyAllActive("annonce", input.titre, input.description);
  return toDto(post);
}

export async function listPosts(
  pagination: { page: number; limit: number },
  opts: { includeHidden: boolean },
) {
  const where = opts.includeHidden ? {} : { isHidden: false };
  const [items, total] = await Promise.all([
    prisma.postInfo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: { author: { select: { fullName: true } } },
    }),
    prisma.postInfo.count({ where }),
  ]);
  return { items: items.map(toDto), total, page: pagination.page, limit: pagination.limit };
}

export async function setPostHidden(id: string, isHidden: boolean) {
  const existing = await prisma.postInfo.findUnique({ where: { id } });
  if (!existing) throw new ServiceError(404, "Post introuvable.");
  const post = await prisma.postInfo.update({
    where: { id },
    data: { isHidden },
    include: { author: { select: { fullName: true } } },
  });
  return toDto(post);
}
