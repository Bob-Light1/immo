import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { ZodError } from "zod";
import {
  ERROR_CODES,
  LOCALES,
  createFactureSchema,
  createUserSchema,
  evenementSchema,
  updateCompteurSchema,
  updateFactureSchema,
} from "@campusgest/shared";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import de from "../messages/de.json";

/**
 * The error catalogue is the one place where a missing translation is invisible
 * until a resident hits the failure it describes — by then they are already
 * looking at a raw key, in the middle of a request that just went wrong. These
 * checks are what make an uncovered code a build failure instead.
 */

const CATALOGUES: Record<string, unknown> = { fr, en, de };

function lookup(catalogue: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      catalogue,
    );
}

/** Placeholder names, ignoring the ICU formatter/branch syntax after the comma. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*(\w+)/g)].map((m) => m[1]!).sort();
}

describe("error catalogue", () => {
  it("covers every code in all three locales", () => {
    const manquants: string[] = [];
    for (const code of ERROR_CODES) {
      for (const locale of LOCALES) {
        const message = lookup(CATALOGUES[locale], `errors.${code}`);
        if (typeof message !== "string" || message.length === 0) {
          manquants.push(`${locale}: ${code}`);
        }
      }
    }
    expect(manquants).toEqual([]);
  });

  it("interpolates the same placeholders in every locale", () => {
    const divergents: string[] = [];
    for (const code of ERROR_CODES) {
      const attendus = placeholders(lookup(fr, `errors.${code}`) as string);
      for (const locale of LOCALES) {
        const message = lookup(CATALOGUES[locale], `errors.${code}`) as string;
        // A parameter dropped in one translation renders as a blank in the
        // middle of a sentence the reader has no other way to make sense of.
        if (placeholders(message).join() !== attendus.join()) {
          divergents.push(`${locale}: ${code}`);
        }
      }
    }
    expect(divergents).toEqual([]);
  });

  it("renders every message through ICU without falling back to the key", () => {
    // The plural and select branches are written by hand; a stray brace only
    // shows up at render time, as the raw key in place of the sentence.
    const echecs: string[] = [];
    for (const locale of LOCALES) {
      const t = createTranslator({
        locale,
        messages: CATALOGUES[locale] as never,
        namespace: "errors",
        onError: () => {},
      });
      for (const code of ERROR_CODES) {
        const rendu = t(
          code as never,
          // Superfluous values are ignored; the ones a message needs are here.
          { count: 2, factures: 1, chambres: 3, reste: 1500, secondes: 30, maxMo: 10,
            mois: "2026-06", annee: "2026", type: "Eau", libelle: "Bloc A",
            acceptes: "image/png" } as never,
        );
        if (rendu === code || rendu.includes("errors.")) echecs.push(`${locale}: ${code}`);
      }
    }
    expect(echecs).toEqual([]);
  });

  it("codes the validation rules whose wording the reader has to act on", () => {
    // Guards the link the route wrapper relies on: a refinement written without
    // `issueCode` — or moved back onto a built-in check, which has nowhere to
    // put the code — answers "invalid input" and says nothing more.
    const cas: [string, () => unknown][] = [
      ["validation.telephoneInvalide", () => createUserSchema.parse({ username: "abc", fullName: "Ada L", role: "locataire", phone: "12" })],
      ["validation.aucuneModification", () => updateCompteurSchema.parse({})],
      ["validation.heureFormat", () => evenementSchema.parse({ titre: "Fête", dateEvent: "2026-06-01", heure: "19h" })],
      ["validation.moisFormat", () => createFactureSchema.parse({ type: "Eau", montantTotal: 1000, mois: "2026-13", dateLimite: "2026-06-30" })],
      // Creation states which amount the regime expects; correction only refuses
      // the two together — the two rules answer with their own code.
      ["validation.montantRegime", () => createFactureSchema.parse({ type: "Eau", mois: "2026-06", dateLimite: "2026-06-30" })],
      ["validation.montantXor", () => updateFactureSchema.parse({ montantTotal: 1000, montantParLocataire: 500 })],
      ["validation.dateLimiteHorsPeriode", () => createFactureSchema.parse({ type: "Eau", montantTotal: 1000, mois: "2026-06", dateLimite: "2020-01-01" })],
      ["validation.dateLimiteLoyer", () => createFactureSchema.parse({ type: "Loyer", montantParLocataire: 1000, mois: "2026-01", dateLimite: "2026-02-01" })],
    ];

    for (const [attendu, parse] of cas) {
      let codes: unknown[] = [];
      try {
        parse();
      } catch (e) {
        codes = (e as ZodError).issues
          .filter((i) => i.code === "custom")
          .map((i) => (i.params as { code?: string } | undefined)?.code);
      }
      expect(codes, attendu).toContain(attendu);
    }
  });

  it("has no catalogue entry without a code behind it", () => {
    const connus = new Set<string>(ERROR_CODES);
    const orphelins: string[] = [];
    const errors = (fr as { errors: Record<string, Record<string, string>> }).errors;
    for (const [groupe, entrees] of Object.entries(errors)) {
      for (const cle of Object.keys(entrees)) {
        if (!connus.has(`${groupe}.${cle}`)) orphelins.push(`${groupe}.${cle}`);
      }
    }
    expect(orphelins).toEqual([]);
  });
});
