import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { Client as MinioClient } from "minio";
import { STORAGE_PATH_PREFIX } from "@campusgest/shared";
import { ServiceError } from "./api";

/**
 * Object storage (design §6: post/portfolio/project images, documents, payment
 * receipts). Kept behind an interface: the active implementation is selected by
 * `STORAGE_DRIVER`. Dev and self-hosted setups use an S3-compatible backend
 * (MinIO); a Cloudinary implementation can be plugged in later without
 * touching any caller.
 *
 * Objects are addressed by an **origin-relative** path (`/storage/<bucket>/<key>`),
 * never by an absolute URL. What lands in the database therefore survives a
 * change of domain — a tunnel that gets a new name between two dev sessions, a
 * migration to another host — whereas a persisted absolute URL dies with it.
 * In production Caddy answers that prefix straight from the bucket; in dev the
 * route handler below it does, since nothing sits in front of MinIO.
 */

export type UploadKind = "image" | "document";

export interface StoredObject {
  /** Origin-relative path to serve the object from. */
  url: string;
  key: string;
}

export interface StoredContent {
  stream: Readable;
  contentType: string;
  size: number;
  etag: string;
  lastModified: Date;
}

export interface StorageProvider {
  /** Uploads an object and returns its origin-relative path. */
  upload(input: {
    buffer: Buffer;
    contentType: string;
    ext: string;
    prefix: string;
  }): Promise<StoredObject>;
  /** Reads an object back. Throws ServiceError 404 when the key is unknown. */
  read(key: string): Promise<StoredContent>;
  /** Deletes an object. Idempotent: an already-absent key is not an error. */
  remove(key: string): Promise<void>;
  /** Bucket segment the public path is built on. */
  bucketName(): string;
  /** Whether the backend is configured (routes answer 503 otherwise). */
  isConfigured(): boolean;
}

// ─────────────────────────── Backend S3 / MinIO ───────────────────────────

class S3Storage implements StorageProvider {
  private client: MinioClient | null = null;
  private bucket = process.env.S3_BUCKET ?? "";

  bucketName(): string {
    return this.bucket;
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.S3_ENDPOINT &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY &&
        this.bucket,
    );
  }

  private getClient(): MinioClient {
    if (!this.client) {
      this.client = new MinioClient({
        endPoint: process.env.S3_ENDPOINT!,
        port: process.env.S3_PORT ? Number(process.env.S3_PORT) : undefined,
        useSSL: (process.env.S3_USE_SSL ?? "false") === "true",
        accessKey: process.env.S3_ACCESS_KEY!,
        secretKey: process.env.S3_SECRET_KEY!,
        region: process.env.S3_REGION ?? "us-east-1",
      });
    }
    return this.client;
  }

  async upload(input: {
    buffer: Buffer;
    contentType: string;
    ext: string;
    prefix: string;
  }): Promise<StoredObject> {
    const key = `${input.prefix}/${new Date().getFullYear()}/${randomUUID()}.${input.ext}`;
    await this.getClient().putObject(this.bucket, key, input.buffer, input.buffer.length, {
      "Content-Type": input.contentType,
    });
    return { url: publicPath(this.bucket, key), key };
  }

  async read(key: string): Promise<StoredContent> {
    const client = this.getClient();
    try {
      const stat = await client.statObject(this.bucket, key);
      return {
        stream: await client.getObject(this.bucket, key),
        contentType: stat.metaData?.["content-type"] ?? "application/octet-stream",
        size: stat.size,
        etag: stat.etag,
        lastModified: stat.lastModified,
      };
    } catch {
      // statObject/getObject fail the same way for an unknown key and for a
      // bucket the credentials cannot reach; neither is worth distinguishing to
      // the reader, and doing so would confirm which keys exist.
      throw new ServiceError(404, "Objet introuvable.", "upload.objetIntrouvable");
    }
  }

  async remove(key: string): Promise<void> {
    await this.getClient().removeObject(this.bucket, key);
  }
}

/** `/storage/<bucket>/<key>` — matches the `handle_path /storage/*` Caddy rule. */
function publicPath(bucket: string, key: string): string {
  return `${STORAGE_PATH_PREFIX}/${bucket}/${key}`;
}

// ─────────────────────────── Backend selection ───────────────────────────

let provider: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (!provider) {
    const driver = process.env.STORAGE_DRIVER ?? "s3";
    switch (driver) {
      case "s3":
        provider = new S3Storage();
        break;
      // case "cloudinary": provider = new CloudinaryStorage(); break;
      default:
        throw new ServiceError(500, `STORAGE_DRIVER inconnu : ${driver}`);
    }
  }
  return provider;
}

// ─────────────────────────── File validation ───────────────────────────

/** Accepted types per upload kind (design §5.9 image ≤5 MB, §5.15 docs). */
const ALLOWED: Record<UploadKind, { mimes: Record<string, string> }> = {
  image: {
    mimes: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  document: {
    mimes: {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
    },
  },
};

/**
 * Validates the kind + MIME type and returns the normalized file extension.
 * Throws ServiceError 400 when the type is not allowed.
 */
export function resolveExtension(kind: UploadKind, contentType: string): string {
  const ext = ALLOWED[kind]?.mimes[contentType];
  if (!ext) {
    const accepted = Object.keys(ALLOWED[kind].mimes).join(", ");
    throw new ServiceError(
      400,
      `Type de fichier non autorisé. Acceptés : ${accepted}.`,
      "upload.typeNonAutorise",
      { acceptes: accepted },
    );
  }
  return ext;
}

/**
 * Magic bytes expected at the start of the file, per declared type.
 * The bucket serves objects anonymously with the Content-Type supplied by the
 * client: without this check, any content could be uploaded under an image
 * label and served as-is from the application's own origin.
 */
const SIGNATURES: Record<string, { offset: number; bytes: number[] }[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  // RIFF....WEBP: RIFF container (0-3) then format marker (8-11).
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
};

/**
 * Checks that the actual content matches the MIME type declared by the client.
 * Throws ServiceError 400 on mismatch.
 */
export function assertMagicBytes(contentType: string, buffer: Buffer): void {
  const expected = SIGNATURES[contentType];
  if (!expected) throw new ServiceError(400, "Type de fichier non autorisé.", "upload.extensionInconnue");

  const matches = expected.every(({ offset, bytes }) =>
    bytes.every((b, i) => buffer[offset + i] === b),
  );
  if (!matches) {
    throw new ServiceError(
      400,
      "Le contenu du fichier ne correspond pas à son type déclaré.",
      "upload.contenuIncoherent",
    );
  }
}

export function isUploadKind(value: string): value is UploadKind {
  return value === "image" || value === "document";
}
