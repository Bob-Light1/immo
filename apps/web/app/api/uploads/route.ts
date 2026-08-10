import { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES } from "@campusgest/shared";
import { handle, json, ServiceError } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { storage, resolveExtension, isUploadKind, assertMagicBytes } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Uploads a file to the object storage (design §6).
 * Multipart `file` + `kind` (image | document). Returns `{ url }` to paste into
 * the matching field (postSchema.imageUrl, documentSchema.fichierUrl,
 * paiementSchema.justificatifUrl…). Validation: authenticated, size ≤ 5 MB,
 * allowed MIME type. Fine-grained access control (who may attach what) belongs
 * to the resource routes.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);

    if (!storage().isConfigured()) {
      throw new ServiceError(
        503,
        "Stockage non configuré (variables S3_* manquantes).",
        "upload.stockageNonConfigure",
      );
    }

    const form = await req.formData();
    const kind = String(form.get("kind") ?? "image");
    const file = form.get("file");

    if (!isUploadKind(kind)) {
      throw new ServiceError(400, "Genre d'upload invalide (image | document).", "upload.genreInvalide");
    }
    if (!(file instanceof File)) {
      throw new ServiceError(400, "Champ `file` manquant.", "upload.fichierManquant");
    }
    if (file.size === 0) {
      throw new ServiceError(400, "Fichier vide.", "upload.fichierVide");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ServiceError(
        400,
        `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`,
        "upload.fichierTropGros",
        { maxMo: MAX_UPLOAD_BYTES / 1024 / 1024 },
      );
    }

    const ext = resolveExtension(kind, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    // The Content-Type comes from the client: check the claim against the bytes.
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
