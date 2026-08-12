import { z } from "zod";
import { issueCode } from "./errors";
import {
  ROLES,
  LOCALES,
  DEFAULT_LOCALE,
  COMPTEUR_TYPES,
  COMPTEUR_SCOPES,
  PAIEMENT_MODES,
  TICKET_CATEGORIES,
  TICKET_STATUTS,
  DOCUMENT_CATEGORIES,
  MIN_PASSWORD_LENGTH,
  STORAGE_PATH_PREFIX,
} from "./types";
import {
  MOIS_REGEX,
  dateLimiteCoherente,
  dateLimiteLoyerCoherente,
  DATE_LIMITE_MAX_MOIS,
  LOYER_ECHEANCE_MIN_MOIS,
} from "./dates";
import { isLoyer } from "./types";

/**
 * A stored asset, as returned by `POST /api/uploads`: an origin-relative
 * `/storage/<bucket>/<key>` path, never an absolute URL — see `lib/storage.ts`
 * for why persisting an origin is what broke images across environments.
 *
 * Absolute http(s) values are still accepted so rows written before the switch
 * keep validating when their owner edits them; everything new is relative.
 */
export const storageUrlSchema = z
  .string()
  .max(500)
  .refine(
    (v) =>
      (v.startsWith(`${STORAGE_PATH_PREFIX}/`) && !v.includes("..")) || /^https?:\/\/\S+$/.test(v),
    issueCode("upload.cheminInvalide", "Chemin de fichier invalide."),
  );

/**
 * Object key targeted by a cleanup deletion. Traversal segments are refused
 * here rather than at the storage client: the key is caller-supplied and only
 * ever names an object this application wrote.
 */
export const uploadKeySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(400)
    .refine(
      (v) => !v.startsWith("/") && !v.split("/").some((s) => s === "." || s === ".."),
      issueCode("upload.cheminInvalide", "Chemin de fichier invalide."),
    ),
});

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
// Written as a single refinement rather than a min/max/regex chain: only a
// refinement can carry an error code, and the reader gets one sentence instead
// of up to three overlapping complaints about the same field.
export const phoneSchema = z
  .string()
  .trim()
  .refine(
    (v) => v.length >= 6 && v.length <= 20 && /^[+0-9][0-9 ().-]*$/.test(v),
    issueCode("validation.telephoneInvalide", "Numéro de téléphone invalide."),
  );

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  fullName: z.string().min(2).max(100),
  role: z.enum(ROLES),
  email: z.string().email().max(150).optional().or(z.literal("")),
  phone: phoneSchema,
  language: z.enum(LOCALES).default(DEFAULT_LOCALE),
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

// ─── Meters ───
// Meter readings are cumulative counts (m³, kWh) stored as BigInt: cap them the
// same way amounts are, so a mistyped reading is rejected at the edge.
const indexCompteur = z.coerce.number().int().nonnegative().max(1_000_000_000_000);

export const createCompteurSchema = z.object({
  type: z.enum(COMPTEUR_TYPES),
  libelle: z.string().trim().min(2).max(60),
  scope: z.enum(COMPTEUR_SCOPES).default("cite"),
  dernierIndex: indexCompteur.default(0),
});
export type CreateCompteurInput = z.infer<typeof createCompteurSchema>;

/**
 * `type` is deliberately absent: invoices already attached to the meter were
 * raised against a water or an electricity count, and flipping it would rewrite
 * what they measured. A mistyped type is fixed by creating the right meter.
 */
export const updateCompteurSchema = z
  .object({
    libelle: z.string().trim().min(2).max(60).optional(),
    scope: z.enum(COMPTEUR_SCOPES).optional(),
    dernierIndex: indexCompteur.optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    issueCode("validation.aucuneModification", "Aucune modification fournie."),
  );
export type UpdateCompteurInput = z.infer<typeof updateCompteurSchema>;

// ─── Rooms ───
/**
 * Annual rent of a room, in XAF. Nonnegative rather than positive: `0` is the
 * stored "not priced yet", which is what every room starts as and what makes a
 * rent invoice ask for the amount instead of billing the room at nothing.
 */
const loyerChambre = z.coerce.number().int().nonnegative().max(1_000_000_000_000);

export const createChambreSchema = z.object({
  bloc: z.string().trim().min(1).max(20),
  numero: z.string().trim().min(1).max(20),
  capacite: z.coerce.number().int().min(1).max(20).default(1),
  loyerAnnuel: loyerChambre.default(0),
  compteurElecId: z.string().uuid().nullable().optional(),
});
export type CreateChambreInput = z.infer<typeof createChambreSchema>;

/**
 * Correcting a room. `loyerAnnuel` is the field that moves every year, so it is
 * editable on its own — restating the tariff must not require retyping the
 * block and number of a room that has not otherwise changed.
 */
export const updateChambreSchema = z
  .object({
    bloc: z.string().trim().min(1).max(20).optional(),
    numero: z.string().trim().min(1).max(20).optional(),
    capacite: z.coerce.number().int().min(1).max(20).optional(),
    loyerAnnuel: loyerChambre.optional(),
    // `null` detaches the meter. Absent leaves it as it is.
    compteurElecId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    issueCode("validation.aucuneModification", "Aucune modification fournie."),
  );
export type UpdateChambreInput = z.infer<typeof updateChambreSchema>;

/** Moving a tenant in or out of a room. `null` leaves them unassigned. */
export const assignChambreSchema = z.object({
  roomId: z.string().uuid().nullable(),
});
export type AssignChambreInput = z.infer<typeof assignChambreSchema>;

// ─── Invoices ───
const moisSchema = z
  .string()
  .refine(
    (v) => MOIS_REGEX.test(v),
    issueCode("validation.moisFormat", "Format attendu : YYYY-MM (mois 01 à 12)"),
  );

// XAF are stored as BigInt but serialized as JS numbers: cap amounts well below
// the safe-integer range so a fat-fingered entry is rejected at the edge rather
// than silently losing precision somewhere down the line.
const montantXAF = z.coerce.number().int().positive().max(1_000_000_000_000);

// The bound is a constant, but it travels as a parameter all the same: the
// translated wording has to be able to state it, and hard-coding it into three
// catalogues would put the number out of reach of the code that defines it.
const dateLimiteMessage = issueCode(
  "validation.dateLimiteHorsPeriode",
  `L'échéance doit tomber entre le premier jour du mois facturé et ${DATE_LIMITE_MAX_MOIS} mois plus tard.`,
  { path: ["dateLimite"], params: { mois: DATE_LIMITE_MAX_MOIS } },
);

const dateLimiteLoyerMessage = issueCode(
  "validation.dateLimiteLoyer",
  `Facture de loyer : le forfait couvre une année, l'échéance doit donc être au moins ${LOYER_ECHEANCE_MIN_MOIS} mois après le début de la période (par exemple le 31 décembre).`,
  { path: ["dateLimite"], params: { mois: LOYER_ECHEANCE_MIN_MOIS } },
);

export const createFactureSchema = z
  .object({
    type: z.string().trim().min(2).max(60),
    // Global amount to split (Eau, Électricité, Hébergement…).
    montantTotal: montantXAF.optional(),
    // "Loyer" regime: each line is filled from the tariff of the room its tenant
    // occupies, so this is only the fallback for a tenant with no priced room.
    montantParLocataire: montantXAF.optional(),
    mois: moisSchema,
    dateLimite: z.coerce.date(),
    compteurId: z.string().uuid().optional(),
    // targeted tenants; empty -> every active tenant
    locataireIds: z.array(z.string().uuid()).optional(),
  })
  // Which amount field the regime expects. Rent needs none — the rooms carry
  // the tariffs — but a total to divide would be meaningless on it, and a
  // charge cannot be raised without one.
  .refine(
    (d) =>
      isLoyer(d.type)
        ? d.montantTotal == null
        : d.montantTotal != null && d.montantParLocataire == null,
    issueCode(
      "validation.montantRegime",
      "Loyer : le montant vient du tarif des chambres (un montant par locataire ne sert que de repli). Toute autre facture se répartit à partir d'un montant total.",
      { path: ["montantTotal"] },
    ),
  )
  .refine((d) => dateLimiteCoherente(d.mois, d.dateLimite), dateLimiteMessage)
  .refine((d) => !isLoyer(d.type) || dateLimiteLoyerCoherente(d.mois, d.dateLimite), dateLimiteLoyerMessage);
export type CreateFactureInput = z.infer<typeof createFactureSchema>;

/**
 * Draft correction. A mistyped amount used to be unfixable — coefficients were
 * the only editable part — which left cancelling and re-creating as the sole
 * way out. Every field here recomputes the split, so it is confined to drafts.
 */
export const updateFactureSchema = z
  .object({
    type: z.string().trim().min(2).max(60).optional(),
    montantTotal: montantXAF.optional(),
    montantParLocataire: montantXAF.optional(),
    mois: moisSchema.optional(),
    dateLimite: z.coerce.date().optional(),
    // Tenants attached to the draft. The roster was frozen at creation, so a
    // tenant who moved in before publication — the ordinary case on a
    // rolled-over draft — forced the invoice to be deleted and re-entered.
    // Coefficients already set are kept; a newcomer starts at 1.
    locataireIds: z.array(z.string().uuid()).min(1).optional(),
    // `null` detaches the meter. Absent leaves it as it is.
    compteurId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    issueCode("validation.aucuneModification", "Aucune modification fournie."),
  )
  .refine(
    (d) => !(d.montantTotal != null && d.montantParLocataire != null),
    issueCode(
      "validation.montantXor",
      "Renseignez soit le montant total, soit le montant par locataire.",
      { path: ["montantTotal"] },
    ),
  )
  // Only checkable here when both fields travel together; the service re-checks
  // against the invoice's stored month when only one of them is sent.
  .refine((d) => !(d.mois && d.dateLimite) || dateLimiteCoherente(d.mois, d.dateLimite), dateLimiteMessage);
export type UpdateFactureInput = z.infer<typeof updateFactureSchema>;

export const coefficientsSchema = z.object({
  coefficients: z
    .array(
      z.object({
        locataireId: z.string().uuid(),
        // Two decimals, matching the Decimal(4,2) column. A finer value was
        // accepted, split on its full precision, then rounded by Postgres on
        // the way in: the draft's amounts no longer matched the coefficient on
        // record, and a recompute at publication silently moved them.
        coefficient: z.coerce.number().min(0.1).max(99.99).multipleOf(0.01),
      }),
    )
    .min(1),
});
export type CoefficientsInput = z.infer<typeof coefficientsSchema>;

/**
 * Per-tenant annual rent on a draft. Rooms are not priced alike, and a tariff
 * moves with inflation from one year to the next, so a rent invoice carries one
 * amount per tenant rather than a single figure for the whole residence.
 *
 * Two ways in, and they compose. `depuisChambres` re-reads the tariff of the
 * room each tenant occupies — the yearly revalorisation, done once on the room
 * and pulled into the draft — and `loyers` restates the tenants listed, leaving
 * the others on the amount their line already carries.
 */
export const loyersSchema = z
  .object({
    depuisChambres: z.boolean().optional(),
    loyers: z
      .array(
        z.object({
          locataireId: z.string().uuid(),
          montant: montantXAF,
        }),
      )
      .min(1)
      .optional(),
  })
  .refine(
    (d) => d.depuisChambres === true || d.loyers != null,
    issueCode("validation.aucuneModification", "Aucune modification fournie."),
  );
export type LoyersInput = z.infer<typeof loyersSchema>;

export const paiementSchema = z.object({
  factureLocataireId: z.string().uuid(),
  montant: montantXAF,
  mode: z.enum(PAIEMENT_MODES),
  reference: z.string().max(80).optional(),
  justificatifUrl: storageUrlSchema.optional(),
});
export type PaiementInput = z.infer<typeof paiementSchema>;

/**
 * Cancelling a wrongly recorded payment. The reason is mandatory and lands in
 * the audit log: the payment row itself is removed (so its receipt PDF stops
 * being downloadable, which a soft-delete flag would not achieve), leaving the
 * audit trail as the sole account of what happened.
 */
export const annulationPaiementSchema = z.object({
  motif: z.string().trim().min(5).max(200),
});
export type AnnulationPaiementInput = z.infer<typeof annulationPaiementSchema>;

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
  heure: z
    .string()
    .refine((v) => /^\d{2}:\d{2}$/.test(v), issueCode("validation.heureFormat", "Format attendu : HH:mm")),
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
  imageUrl: storageUrlSchema,
});
export type PostInput = z.infer<typeof postSchema>;

export const postHiddenSchema = z.object({
  isHidden: z.boolean(),
});

// ─── Shared documents (§5.15 — file required) ───
export const documentSchema = z.object({
  titre: z.string().min(1).max(200),
  fichierUrl: storageUrlSchema,
  categorie: z.enum(DOCUMENT_CATEGORIES),
  visibleRoles: z.array(z.enum(ROLES)).optional(),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const ticketSchema = z.object({
  categorie: z.enum(TICKET_CATEGORIES),
  description: z.string().min(3).max(2000),
  imageUrl: storageUrlSchema.optional(),
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
  photoUrl: storageUrlSchema.optional().or(z.literal("")),
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
  imageUrl: storageUrlSchema.optional(),
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
  mois: moisSchema,
  type: z.string().trim().min(2).max(60),
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
