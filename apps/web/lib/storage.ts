import { randomUUID } from "crypto";
import { Client as MinioClient } from "minio";
import { ServiceError } from "./api";

/**
 * Object storage (design §6: post/portfolio/project images, documents, payment
 * receipts). Kept behind an interface: the active implementation is selected by
 * `STORAGE_DRIVER`. Dev and self-hosted setups use an S3-compatible backend
 * (MinIO); a Cloudinary implementation can be plugged in later without
 * touching any caller.
 */

export type UploadKind = "image" | "document";

export interface StoredObject {
  url: string;
  key: string;
}

export interface StorageProvider {
  /** Uploads an object and returns its public URL. */
  upload(input: {
    buffer: Buffer;
    contentType: string;
    ext: string;
    prefix: string;
  }): Promise<StoredObject>;
  /** Whether the backend is configured (routes answer 503 otherwise). */
  isConfigured(): boolean;
}

// ─────────────────────────── Backend S3 / MinIO ───────────────────────────

class S3Storage implements StorageProvider {
  private client: MinioClient | null = null;
  private bucket = process.env.S3_BUCKET ?? "";
  private publicUrl = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");

  isConfigured(): boolean {
    return Boolean(
      process.env.S3_ENDPOINT &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY &&
        this.bucket &&
        this.publicUrl,
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
    return { url: `${this.publicUrl}/${key}`, key };
  }
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
    throw new ServiceError(400, `Type de fichier non autorisé. Acceptés : ${accepted}.`);
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
  if (!expected) throw new ServiceError(400, "Type de fichier non autorisé.");

  const matches = expected.every(({ offset, bytes }) =>
    bytes.every((b, i) => buffer[offset + i] === b),
  );
  if (!matches) {
    throw new ServiceError(400, "Le contenu du fichier ne correspond pas à son type déclaré.");
  }
}

export function isUploadKind(value: string): value is UploadKind {
  return value === "image" || value === "document";
}
