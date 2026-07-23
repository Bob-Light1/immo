// Types & constantes partagés front/back.
// Les valeurs reflètent les enums Prisma (packages/db/prisma/schema.prisma).

export const ROLES = ["admin", "bailleur", "locataire"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["fr", "en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

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

// Canaux de notification (préférences par utilisateur).
export interface NotifPrefs {
  push: boolean;
  sms: boolean;
  email: boolean;
}

// Payload JWT (access token).
export interface JwtPayload {
  sub: string; // userId
  role: Role;
  ver: number; // token_version (révocation)
  iat?: number;
  exp?: number;
}

// Réponse paginée standard des listes (?page&limit — conception §8).
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Règles métier (constantes centralisées).
export const MIN_PASSWORD_LENGTH = 8;
export const DISTRESS_CLICKS_TO_TRIGGER = 5;
export const DISTRESS_REVIEW_THRESHOLD = 3; // signaux / 3 jours -> revue admin
export const BIRTHDAY_NOTICE_DAYS = 7;
export const FACTURE_ALERT_DAYS_BEFORE = 2;
export const MAX_RECONDUCTION_STREAK = 2;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
