import { describe, it, expect } from "vitest";
import { LOCALES } from "./types";
import { NOTIF_KEYS, isNotifKey, renderNotif } from "./notifications";

describe("renderNotif", () => {
  it("returns null for an unknown key so the caller can fall back", () => {
    expect(renderNotif("annonce.libre", "fr")).toBeNull();
    expect(isNotifKey("annonce.libre")).toBe(false);
  });

  it("falls back to the default locale for an unsupported language", () => {
    const fr = renderNotif("suggestion.lue", "fr")!;
    expect(renderNotif("suggestion.lue", "es")).toEqual(fr);
    expect(renderNotif("suggestion.lue", null)).toEqual(fr);
  });

  it("interpolates plain parameters", () => {
    expect(renderNotif("document.nouveau", "en", { titre: "Règlement 2026" })).toEqual({
      title: "New document",
      body: "Règlement 2026",
    });
  });

  it("translates every locale of a keyed message", () => {
    expect(renderNotif("suggestion.lue", "de")!.title).toBe("Vorschlag gelesen");
    expect(renderNotif("suggestion.lue", "en")!.title).toBe("Suggestion reviewed");
  });

  it("resolves select branches, including the empty one", () => {
    const flagged = renderNotif("distress.signal", "fr", {
      name: "Awa Ndiaye",
      revue: "yes",
      position: "yes",
    })!;
    expect(flagged.title).toBe("🚨 Signal de détresse (à vérifier)");
    expect(flagged.body).toBe("Awa Ndiaye a déclenché un signal de détresse. Position partagée.");

    const plain = renderNotif("distress.signal", "fr", {
      name: "Awa Ndiaye",
      revue: "no",
      position: "no",
    })!;
    expect(plain.title).toBe("🚨 Signal de détresse");
    expect(plain.body).toBe("Awa Ndiaye a déclenché un signal de détresse.");
  });

  it("renders placeholders nested inside a select branch", () => {
    const withShare = renderNotif("prediction.publiee", "fr", {
      type: "Eau",
      mois: "2026-06",
      montant: 450000,
      part: "yes",
      partMontant: 15000,
    })!;
    expect(withShare.body).toContain("Part estimée par locataire :");
    expect(withShare.body).toContain("15");

    const withoutShare = renderNotif("prediction.publiee", "fr", {
      type: "Eau",
      mois: "2026-06",
      montant: 450000,
      part: "no",
    })!;
    expect(withoutShare.body).not.toContain("Part estimée");
  });

  it("applies plural rules per locale and substitutes #", () => {
    const one = renderNotif("echeance.retard", "en", {
      jalon: "J+3",
      type: "Eau",
      periode: "2026-06",
      reste: 12000,
      jours: 1,
    })!;
    expect(one.body).toContain("1 day overdue");

    const many = renderNotif("echeance.retard", "en", {
      jalon: "J+3",
      type: "Eau",
      periode: "2026-06",
      reste: 12000,
      jours: 3,
    })!;
    expect(many.body).toContain("3 days overdue");
  });

  it("formats XAF amounts without cents", () => {
    const rendered = renderNotif("facture.publiee", "fr", {
      type: "Eau",
      periode: "2026-06",
      montant: 12500,
      echeance: "2026-06-30",
    })!;
    expect(rendered.body).not.toContain(",00");
    expect(rendered.body).toMatch(/12\s?500/);
  });

  it("looks up enumerations through the locale table", () => {
    expect(
      renderNotif("ticket.statut", "de", { categorie: "Plomberie", statut: "en_cours" })!.body,
    ).toContain("In Bearbeitung");
    // An unknown member degrades to its raw value rather than vanishing.
    expect(
      renderNotif("ticket.statut", "fr", { categorie: "Plomberie", statut: "annule" })!.body,
    ).toContain("annule");
  });

  it("keeps every key translated in all three locales", () => {
    // Every placeholder resolves to 1: valid as a number, a date and a select
    // discriminant at once, so a body made only of placeholders is still
    // non-empty and a missing translation stands out.
    const anyParam = new Proxy({} as Record<string, number>, { get: () => 1 });
    for (const key of NOTIF_KEYS) {
      for (const locale of LOCALES) {
        const rendered = renderNotif(key, locale, anyParam)!;
        expect(rendered, `${key}/${locale}`).not.toBeNull();
        expect(rendered.title.trim(), `${key}/${locale} title`).not.toBe("");
        expect(rendered.body.trim(), `${key}/${locale} body`).not.toBe("");
      }
    }
  });
});
