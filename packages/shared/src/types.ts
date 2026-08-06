// Shared types & constants (front/back).
// Values mirror the Prisma enums (packages/db/prisma/schema.prisma).

export const ROLES = ["admin", "bailleur", "locataire"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["fr", "en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * Invoice types suggested to the Admin (free-text field: the list is only a
 * hint). Two regimes coexist:
 *  - "Loyer": flat annual amount per tenant, never split;
 *  - all others (Eau, Électricité, Hébergement…): global amount split by
 *    coefficient (§5.1).
 */
export const FACTURE_TYPES = [
  "Eau",
  "Électricité",
  "Loyer",
  "Hébergement",
  "Nettoyage",
  "Contribution",
] as const;

export const FACTURE_TYPE_LOYER = "Loyer";
export const FACTURE_TYPE_HEBERGEMENT = "Hébergement";

/** Normalizes a free-text type (case, accents, spacing) for comparison. */
export function normalizeFactureType(type: string): string {
  return type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** True when the invoice follows the "loyer" regime (flat annual, no split). */
export function isLoyer(type: string): boolean {
  return normalizeFactureType(type) === "loyer";
}

export const PAIEMENT_MODES = ["especes", "orange_money", "mtn_momo", "virement"] as const;
export type PaiementMode = (typeof PAIEMENT_MODES)[number];

export const LIGNE_STATUTS = ["en_attente", "partiel", "paye", "retard"] as const;
export type LigneStatut = (typeof LIGNE_STATUTS)[number];

export const EVENEMENT_STATUTS = ["en_attente", "approuve", "rejete"] as const;
export type EvenementStatut = (typeof EVENEMENT_STATUTS)[number];

export const TICKET_CATEGORIES = ["plomberie", "electricite", "mobilier", "autre"] as const;
export type TicketCategorie = (typeof TICKET_CATEGORIES)[number];

export const DOCUMENT_CATEGORIES = [
  "reglement",
  "contrat",
  "guide",
  "administratif",
  "autre",
] as const;
export type DocumentCategorie = (typeof DOCUMENT_CATEGORIES)[number];

export const TICKET_STATUTS = ["ouvert", "en_cours", "resolu"] as const;
export type TicketStatut = (typeof TICKET_STATUTS)[number];

export const NOTIFICATION_TYPES = [
  "annonce",
  "alerte_facture",
  "anniversaire",
  "detresse",
  "lecture",
  "evenement",
  "prediction",
  "maintenance",
  "sondage",
  "systeme",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Notification channels (per-user preferences).
export interface NotifPrefs {
  push: boolean;
  sms: boolean;
  email: boolean;
}

// JWT payload (access token).
export interface JwtPayload {
  sub: string; // userId
  role: Role;
  ver: number; // token_version (revocation)
  iat?: number;
  exp?: number;
}

// Standard paginated list response (?page&limit — design doc §8).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Business rules (centralized constants).
export const MIN_PASSWORD_LENGTH = 8;
export const DISTRESS_CLICKS_TO_TRIGGER = 5;
export const DISTRESS_REVIEW_THRESHOLD = 3; // signals / 3 days -> admin review
export const BIRTHDAY_NOTICE_DAYS = 7;
export const FACTURE_ALERT_DAYS_BEFORE = 2;
export const MAX_RECONDUCTION_STREAK = 2;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
