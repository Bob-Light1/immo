import { z } from "zod";
import {
  ROLES,
  LOCALES,
  PAIEMENT_MODES,
  TICKET_CATEGORIES,
  TICKET_STATUTS,
  DOCUMENT_CATEGORIES,
  MIN_PASSWORD_LENGTH,
} from "./types";

// ─── Auth ───
export const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
  totp: z.string().length(6).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changeCredentialsSchema = z.object({
  newUsername: z.string().min(3).max(50).optional(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});
export type ChangeCredentialsInput = z.infer<typeof changeCredentialsSchema>;

// ─── Users ───
// Phone is mandatory (reachability if trouble occurs on site): 6 to 20
// characters, digits and the usual separators (+, spaces, parentheses, dashes).
export const phoneSchema = z
  .string()
  .trim()
  .min(6, "Numéro de téléphone trop court.")
  .max(20)
  .regex(/^[+0-9][0-9 ().-]*$/, "Numéro de téléphone invalide.");

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  fullName: z.string().min(2).max(100),
  role: z.enum(ROLES),
  email: z.string().email().max(150).optional().or(z.literal("")),
  phone: phoneSchema,
  language: z.enum(LOCALES).default("fr"),
  roomId: z.string().uuid().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  email: z.string().email().max(150).optional(),
  phone: phoneSchema.optional(),
  language: z.enum(LOCALES).optional(),
  birthday: z.coerce.date().optional(),
  birthdayPublic: z.boolean().optional(),
  birthdayYearHidden: z.boolean().optional(),
  notifPrefs: z
    .object({ push: z.boolean(), sms: z.boolean(), email: z.boolean() })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Invoices ───
const moisRegex = /^\d{4}-\d{2}$/;

export const createFactureSchema = z
  .object({
    type: z.string().min(2).max(60),
    // Global amount to split (Eau, Électricité, Hébergement…).
    montantTotal: z.coerce.number().int().positive().optional(),
    // "Loyer" regime: flat annual amount owed by each tenant, never split.
    montantParLocataire: z.coerce.number().int().positive().optional(),
    mois: z.string().regex(moisRegex, "Format attendu : YYYY-MM"),
    dateLimite: z.coerce.date(),
    compteurId: z.string().uuid().optional(),
    // targeted tenants; empty -> every active tenant
    locataireIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => (d.montantTotal != null) !== (d.montantParLocataire != null), {
    message: "Renseignez soit le montant total, soit le montant par locataire.",
    path: ["montantTotal"],
  });
export type CreateFactureInput = z.infer<typeof createFactureSchema>;

export const coefficientsSchema = z.object({
  coefficients: z
    .array(
      z.object({
        locataireId: z.string().uuid(),
        coefficient: z.coerce.number().min(0.1).max(99.99),
      }),
    )
    .min(1),
});
export type CoefficientsInput = z.infer<typeof coefficientsSchema>;

export const paiementSchema = z.object({
  factureLocataireId: z.string().uuid(),
  montant: z.coerce.number().int().positive(),
  mode: z.enum(PAIEMENT_MODES),
  reference: z.string().max(80).optional(),
  justificatifUrl: z.string().url().optional(),
});
export type PaiementInput = z.infer<typeof paiementSchema>;

// ─── Notifications & announcements ───
// Announcement scope: "all" = every active user, otherwise a single role.
export const ANNONCE_SCOPES = ["all", "locataire", "bailleur", "admin"] as const;
export type AnnonceScope = (typeof ANNONCE_SCOPES)[number];

export const annonceSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(2000),
  scope: z.enum(ANNONCE_SCOPES).default("all"),
});
export type AnnonceInput = z.infer<typeof annonceSchema>;

// Web Push subscription (PushSubscription.toJSON()).
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// ─── Community ───
export const suggestionSchema = z.object({
  contenu: z.string().min(3).max(2000),
});
export type SuggestionInput = z.infer<typeof suggestionSchema>;

export const suggestionVisibilitySchema = z.object({
  bailleurVisible: z.boolean(),
});

export const evenementSchema = z.object({
  titre: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  dateEvent: z.coerce.date(),
  heure: z.string().regex(/^\d{2}:\d{2}$/, "Format attendu : HH:mm"),
});
export type EvenementInput = z.infer<typeof evenementSchema>;

// Admin decision on an event (approval / rejection).
export const evenementDecisionSchema = z.object({
  statut: z.enum(["approuve", "rejete"]),
});
export type EvenementDecisionInput = z.infer<typeof evenementDecisionSchema>;

// ─── News feed / posts (§5.9 — image required) ───
export const postSchema = z.object({
  titre: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  imageUrl: z.string().url(),
});
export type PostInput = z.infer<typeof postSchema>;

export const postHiddenSchema = z.object({
  isHidden: z.boolean(),
});

// ─── Shared documents (§5.15 — file required) ───
export const documentSchema = z.object({
  titre: z.string().min(1).max(200),
  fichierUrl: z.string().url(),
  categorie: z.enum(DOCUMENT_CATEGORIES),
  visibleRoles: z.array(z.enum(ROLES)).optional(),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const ticketSchema = z.object({
  categorie: z.enum(TICKET_CATEGORIES),
  description: z.string().min(3).max(2000),
  imageUrl: z.string().url().optional(),
  roomId: z.string().uuid().optional(),
});
export type TicketInput = z.infer<typeof ticketSchema>;

export const ticketStatutSchema = z.object({
  statut: z.enum(TICKET_STATUTS),
  priorite: z.coerce.number().int().min(0).max(3).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});
export type TicketStatutInput = z.infer<typeof ticketStatutSchema>;

// ─── Distress signal (§5.8) ───
export const distressSchema = z.object({
  geoConsent: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type DistressInput = z.infer<typeof distressSchema>;

// Position attached AFTERWARDS: the signal is sent without waiting for geoloc.
export const distressPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type DistressPositionInput = z.infer<typeof distressPositionSchema>;

export const distressBanSchema = z.object({
  disabled: z.boolean(),
});

// ─── Polls (§5.13) ───
export const sondageSchema = z.object({
  question: z.string().min(3).max(300),
  options: z.array(z.string().min(1).max(120)).min(2).max(10),
});
export type SondageInput = z.infer<typeof sondageSchema>;

export const voteSchema = z.object({
  choix: z.coerce.number().int().min(0).max(9),
});

// ─── Portfolio & directory (§5.7 / §5.14) ───
export const portfolioSchema = z.object({
  bio: z.string().max(2000).optional(),
  photoUrl: z.string().url().max(500).optional().or(z.literal("")),
  competences: z.array(z.string().min(1).max(60)).max(30).optional(),
  diplomes: z.array(z.string().min(1).max(120)).max(20).optional(),
  realisations: z.array(z.string().min(1).max(200)).max(20).optional(),
  contact: z.string().max(150).optional(),
  emailPro: z.string().email().max(150).optional().or(z.literal("")),
  dispoRecommandation: z.boolean().optional(),
});
export type PortfolioInput = z.infer<typeof portfolioSchema>;

// ─── Shared project & contributions (§5.10) ───
export const projetSchema = z.object({
  titre: z.string().min(2).max(200),
  description: z.string().min(2),
  objectifs: z.array(z.string().min(1).max(200)).max(20).optional(),
  vision: z.string().max(2000).optional(),
  besoinsFinanciers: z.coerce.number().int().nonnegative().optional(),
  montantContribution: z.coerce.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  visibleRoles: z.array(z.enum(ROLES)).optional(),
});
export type ProjetInput = z.infer<typeof projetSchema>;

export const contributionSchema = z.object({
  montant: z.coerce.number().int().positive(),
});

// ─── 2FA TOTP admin (§9) ───
export const twoFactorVerifySchema = z.object({
  secret: z.string().min(16).max(64),
  code: z.string().regex(/^\d{6}$/),
});

export const twoFactorDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

// After-the-fact entry of a prediction's actual amount (§5.11).
export const predictionReelSchema = z.object({
  montantReel: z.coerce.number().int().nonnegative(),
});

export const predictionSchema = z.object({
  mois: z.string().regex(moisRegex),
  type: z.string().min(2).max(60),
  indiceDiff: z.coerce.number().int().nonnegative().optional(),
  prixUnit: z.coerce.number().int().nonnegative().optional(),
  tva: z.coerce.number().int().nonnegative().optional(),
  locCompteur: z.coerce.number().int().nonnegative().optional(),
  transport: z.coerce.number().int().nonnegative().optional(),
});
export type PredictionInput = z.infer<typeof predictionSchema>;

// ─── Pagination ───
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
