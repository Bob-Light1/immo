import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { STORAGE_PATH_PREFIX } from "@campusgest/shared";
import { handle, ServiceError } from "@/lib/api";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Serves a stored object from `${STORAGE_PATH_PREFIX}/<bucket>/<key>` (design §6).
 *
 * In production Caddy answers this prefix directly from MinIO and the request
 * never reaches Next; this handler is what makes the same origin-relative path
 * work in development, where nothing sits in front of the bucket. Keeping one
 * path shape for both is the point: URLs persisted in the database stay valid
 * across environments and across a change of domain.
 *
 * Deliberately unauthenticated, mirroring the bucket's anonymous-read policy
 * (`mc anonymous set download`): tightening it here would only move the leak,
 * since production serves these bytes without ever consulting the app.
 */
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(async () => {
    const [bucket, ...rest] = params.path;
    const key = rest.join("/");

    // The path is attacker-controlled: only ever address the configured bucket,
    // and refuse any traversal segment before it reaches the S3 client.
    if (!bucket || !key || bucket !== storage().bucketName() || rest.some((s) => s === "." || s === "..")) {
      throw new ServiceError(400, "Chemin d'objet invalide.", "upload.cheminInvalide");
    }
    if (!storage().isConfigured()) {
      throw new ServiceError(
        503,
        "Stockage non configuré (variables S3_* manquantes).",
        "upload.stockageNonConfigure",
      );
    }

    const object = await storage().read(key);

    // Keys carry a UUID and are never rewritten, so the bytes behind one are
    // immutable and can be cached for as long as the client likes.
    const headers = new Headers({
      "Content-Type": object.contentType,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.etag,
      "X-Content-Type-Options": "nosniff",
    });

    if (req.headers.get("if-none-match") === object.etag) {
      object.stream.destroy();
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(Readable.toWeb(object.stream) as ReadableStream, { headers });
  });
}
