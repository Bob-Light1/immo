/**
 * Error codes carried by API responses.
 *
 * A failed request used to answer with a French sentence, which every screen
 * rendered verbatim: a resident reading the interface in German was told what
 * went wrong in a language they had picked the switcher precisely to leave.
 * The response therefore carries a stable code (plus the parameters the wording
 * interpolates), and the client resolves it against `messages/*.json` in the
 * locale on screen. The French sentence stays on the wire as `error` — it is
 * what the server logs, and the fallback for any consumer that is not the UI.
 *
 * The list lives in the shared layer so the throw sites are typo-checked at
 * build time; `errors.test.ts` in `apps/web` keeps the three catalogues in step
 * with it.
 */
export const ERROR_CODES = [
  // ── Authentication & authorization ──
  "auth.tokenManquant",
  "auth.tokenInvalide",
  "auth.roleRefuse",
  "auth.refreshManquant",
  "auth.refreshInvalide",
  "auth.sessionRevoquee",
  "auth.profilRefuse",
  "auth.accesRefuse",
  "auth.codeInvalide",
  "auth.motDePasseIncorrect",

  // ── Missing entities ──
  "introuvable.user",
  "introuvable.facture",
  "introuvable.ligneFacture",
  "introuvable.paiement",
  "introuvable.compteur",
  "introuvable.suggestion",
  "introuvable.sondage",
  "introuvable.signal",
  "introuvable.ticket",
  "introuvable.projet",
  "introuvable.post",
  "introuvable.notification",
  "introuvable.evenement",
  "introuvable.prediction",
  "introuvable.document",

  // ── Users ──
  "user.usernamePris",
  "user.adminNonDesactivable",
  "portfolio.aucunARetirer",

  // ── Invoices (§5.1) ──
  "facture.dejaPubliee",
  "facture.publieeNonModifiable",
  "facture.publieeNonSupprimable",
  "facture.nonPublieeDocument",
  "facture.aucunLocataireActif",
  "facture.aucunLocataireRattacher",
  "facture.locatairesInconnus",
  "facture.locatairesNonRattaches",
  "facture.typeMoisOccupe",
  "facture.loyerAnneeOccupee",
  "facture.loyerMontantAnnuelRequis",
  "facture.loyerMontantTotalInterdit",
  "facture.loyerSansCoefficient",
  "facture.loyerEcheanceTropTot",
  "facture.loyerEntree",
  "facture.loyerSortie",
  "facture.montantParLocataireReserveLoyer",
  "facture.echeanceHorsPeriode",
  "facture.doublonTypeMois",
  "facture.doublonLoyerAnnee",

  // ── Payments (§5.2) ──
  "paiement.factureNonPubliee",
  "paiement.montantDepasseSolde",
  "paiement.encaissementConcurrent",
  "paiement.dejaAnnule",

  // ── Meters ──
  "compteur.libelleDuplique",
  "compteur.utilise",

  // ── Community ──
  "sondage.cloture",
  "sondage.choixInvalide",
  "evenement.dejaTraite",
  "projet.inaccessible",
  "notification.accesRefuse",
  "notification.aucunDestinataire",

  // ── Distress signal (§5.8) ──
  "distress.banni",
  "distress.pasLeVotre",
  "distress.dejaResolu",

  // ── Uploads ──
  "upload.stockageNonConfigure",
  "upload.genreInvalide",
  "upload.fichierManquant",
  "upload.fichierVide",
  "upload.fichierTropGros",
  "upload.typeNonAutorise",
  "upload.extensionInconnue",
  "upload.contenuIncoherent",
  "upload.echec",

  // ── Pure calculation layer ──
  "calcul.aucunLocataire",
  "calcul.montantTotalInvalide",
  "calcul.sommeCoeffInvalide",

  // ── Input validation (Zod refinements) ──
  "validation.telephoneInvalide",
  "validation.moisFormat",
  "validation.heureFormat",
  "validation.aucuneModification",
  "validation.montantXor",
  "validation.dateLimiteHorsPeriode",
  "validation.dateLimiteLoyer",

  // ── Generic ──
  "generic.tropDeRequetes",
  "generic.doublon",
  "generic.referenceInexistante",
  "generic.introuvable",
  "generic.entreeInvalide",
  "generic.serveur",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Values interpolated into a translated error message. */
export type ErrorParams = Record<string, string | number>;

/** Shape of the JSON body every failed API response answers with. */
export interface ApiErrorBody {
  /** Default-locale sentence: what the server logs, and the last-resort text. */
  error: string;
  code?: ErrorCode;
  params?: ErrorParams;
}

/**
 * Options for a Zod refinement that answers with a translatable code.
 *
 * Zod has no notion of an error code, so it rides in the free-form `params` of
 * the custom issue it raises and the route wrapper lifts it into the response.
 * Going through this helper is what makes the code typo-checked: `params` is
 * `Record<string, any>` as far as Zod is concerned.
 *
 * Only refinements can carry one — a built-in check (`.min`, `.regex`) raises a
 * typed issue with no room for it, so a rule whose wording matters to the
 * reader is written as `.refine`.
 */
export function issueCode(
  code: ErrorCode,
  message: string,
  options?: { path?: (string | number)[]; params?: ErrorParams },
): { message: string; path?: (string | number)[]; params: ErrorParams } {
  return { message, path: options?.path, params: { ...options?.params, code } };
}
