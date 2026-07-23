import { randomUUID } from "crypto";
import { Client as MinioClient } from "minio";
import { ServiceError } from "./api";

/**
 * Stockage objet (conception §6 : images posts/portfolio/projets, documents,
 * justificatifs de paiement). Abstraction derrière une interface :
 * l'implémentation active est choisie par `STORAGE_DRIVER`. En dev/self-host
 * on utilise un backend S3-compatible (MinIO) ; une implémentation Cloudinary
 * pourra être branchée plus tard sans toucher aux appelants.
 */

export type UploadKind = "image" | "document";

export interface StoredObject {
  url: string;
  key: string;
}

export interface StorageProvider {
  /** Téléverse un objet et renvoie son URL publique. */
  upload(input: {
    buffer: Buffer;
    contentType: string;
    ext: string;
    prefix: string;
  }): Promise<StoredObject>;
  /** Indique si le backend est configuré (sinon les routes renvoient 503). */
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

// ─────────────────────────── Sélection du backend ───────────────────────────

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

// ─────────────────────────── Validation des fichiers ───────────────────────────

/** Types acceptés par genre d'upload (conception §5.9 image ≤5Mo, §5.15 docs). */
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
 * Valide le genre + le type MIME et renvoie l'extension de fichier normalisée.
 * Lève une ServiceError 400 si le type n'est pas autorisé.
 */
export function resolveExtension(kind: UploadKind, contentType: string): string {
  const ext = ALLOWED[kind]?.mimes[contentType];
  if (!ext) {
    const accepted = Object.keys(ALLOWED[kind].mimes).join(", ");
    throw new ServiceError(400, `Type de fichier non autorisé. Acceptés : ${accepted}.`);
  }
  return ext;
}

export function isUploadKind(value: string): value is UploadKind {
  return value === "image" || value === "document";
}
