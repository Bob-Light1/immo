import { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES } from "@campusgest/shared";
import { handle, json, ServiceError } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { storage, resolveExtension, isUploadKind, assertMagicBytes } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Téléversement d'un fichier vers le stockage objet (conception §6).
 * Multipart `file` + `kind` (image | document). Renvoie `{ url }` à coller
 * dans le champ correspondant (postSchema.imageUrl, documentSchema.fichierUrl,
 * paiementSchema.justificatifUrl…). Validation : authentifié, taille ≤ 5 Mo,
 * type MIME autorisé. Le contrôle d'accès fin (qui peut attacher quoi) est
 * porté par les routes ressources.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);

    if (!storage().isConfigured()) {
      throw new ServiceError(503, "Stockage non configuré (variables S3_* manquantes).");
    }

    const form = await req.formData();
    const kind = String(form.get("kind") ?? "image");
    const file = form.get("file");

    if (!isUploadKind(kind)) {
      throw new ServiceError(400, "Genre d'upload invalide (image | document).");
    }
    if (!(file instanceof File)) {
      throw new ServiceError(400, "Champ `file` manquant.");
    }
    if (file.size === 0) {
      throw new ServiceError(400, "Fichier vide.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ServiceError(400, `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`);
    }

    const ext = resolveExtension(kind, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    // Le Content-Type vient du client : on confronte l'annonce au contenu réel.
    assertMagicBytes(file.type, buffer);
    const stored = await storage().upload({
      buffer,
      contentType: file.type,
      ext,
      prefix: kind === "image" ? "images" : "documents",
    });

    await audit(req, user.sub, "upload.create", "upload", undefined, {
      kind,
      key: stored.key,
      size: file.size,
    });
    return json({ url: stored.url }, { status: 201 });
  });
}
