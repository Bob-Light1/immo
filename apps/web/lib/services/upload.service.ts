import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import { storage } from "@/lib/storage";

/**
 * Object-storage housekeeping (design §6).
 *
 * A file is uploaded before the record that will point at it exists — the form
 * needs a URL to submit. When the second request fails, or the author gives up
 * on the form, the object stays in the bucket with nothing referencing it. This
 * is what lets a screen clean up after itself.
 */

/** Every column that can hold a stored asset path. */
async function isReferenced(url: string): Promise<boolean> {
  const [paiements, portfolios, posts, projets, tickets, documents] = await Promise.all([
    prisma.paiement.count({ where: { justificatifUrl: url } }),
    prisma.portfolio.count({ where: { photoUrl: url } }),
    prisma.postInfo.count({ where: { imageUrl: url } }),
    prisma.projetCommun.count({ where: { imageUrl: url } }),
    prisma.maintenanceTicket.count({ where: { imageUrl: url } }),
    prisma.document.count({ where: { fichierUrl: url } }),
  ]);
  return paiements + portfolios + posts + projets + tickets + documents > 0;
}

/**
 * Deletes an orphaned object on behalf of the user who uploaded it.
 *
 * Two conditions, both necessary. Ownership is read from the audit log, the
 * only record of who uploaded what: that log is written best-effort, so a
 * missing entry refuses the deletion — the cost is a stray object, whereas the
 * opposite default would let anyone name a key and erase it. And the object
 * must be referenced by nothing: this route exists to collect orphans, not to
 * strip the image off a published post.
 */
export async function deleteOwnUpload(userId: string, key: string, url: string): Promise<void> {
  const uploaded = await prisma.auditLog.findFirst({
    where: { userId, action: "upload.create", metadata: { path: ["key"], equals: key } },
    select: { id: true },
  });
  if (!uploaded) {
    throw new ServiceError(403, "Suppression refusée.", "upload.suppressionRefusee");
  }
  if (await isReferenced(url)) {
    throw new ServiceError(409, "Ce fichier est rattaché à un enregistrement.", "upload.suppressionRefusee");
  }
  await storage().remove(key);
}
