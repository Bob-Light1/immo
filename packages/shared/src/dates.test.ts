import { describe, it, expect } from "vitest";
import {
  MOIS_REGEX,
  moisDe,
  moisDecale,
  anneeDe,
  dateLimiteCoherente,
  dateLimiteLoyerCoherente,
  DATE_LIMITE_MAX_MOIS,
  debutJourLocal,
  jourLocal,
} from "./dates";

describe("MOIS_REGEX", () => {
  it("accepte les mois réels", () => {
    for (const m of ["2026-01", "2026-08", "2026-12"]) {
      expect(MOIS_REGEX.test(m)).toBe(true);
    }
  });

  it("rejette les mois impossibles qu'un simple \\d{2} laissait passer", () => {
    for (const m of ["2026-00", "2026-13", "2026-99", "2026-8", "26-08", ""]) {
      expect(MOIS_REGEX.test(m)).toBe(false);
    }
  });
});

describe("moisDe / moisDecale / anneeDe", () => {
  it("dérive la clé mois des composantes locales", () => {
    expect(moisDe(new Date(2026, 7, 15))).toBe("2026-08");
    expect(moisDe(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("franchit les frontières d'année dans les deux sens", () => {
    expect(moisDecale("2026-12", 1)).toBe("2027-01");
    expect(moisDecale("2026-01", -1)).toBe("2025-12");
    expect(moisDecale("2026-08", 0)).toBe("2026-08");
  });

  it("extrait l'année", () => {
    expect(anneeDe("2026-08")).toBe("2026");
  });
});

describe("dateLimiteCoherente", () => {
  it("accepte une échéance dans la période facturée", () => {
    expect(dateLimiteCoherente("2026-08", new Date("2026-08-31"))).toBe(true);
    expect(dateLimiteCoherente("2026-08", new Date("2026-08-01"))).toBe(true);
  });

  it("refuse une échéance antérieure au mois facturé", () => {
    // Otherwise the invoice is overdue the moment it is published and the
    // due-date job fires its J+n alerts straight away.
    expect(dateLimiteCoherente("2026-08", new Date("2026-07-31"))).toBe(false);
  });

  it("refuse une échéance très au-delà de la période", () => {
    const trop = moisDecale("2026-08", DATE_LIMITE_MAX_MOIS + 1);
    expect(dateLimiteCoherente("2026-08", new Date(`${trop}-01`))).toBe(false);
  });
});

describe("dateLimiteLoyerCoherente", () => {
  it("refuse une échéance de fin de mois sur un forfait annuel", () => {
    // The trap that made the whole year's balance overdue after one month.
    expect(dateLimiteLoyerCoherente("2026-01", new Date("2026-01-31"))).toBe(false);
  });

  it("accepte une échéance qui couvre réellement l'année", () => {
    expect(dateLimiteLoyerCoherente("2026-01", new Date("2026-12-31"))).toBe(true);
  });

  it("reste compatible avec une année académique (septembre → août)", () => {
    expect(dateLimiteLoyerCoherente("2026-09", new Date("2027-08-31"))).toBe(true);
  });
});

describe("debutJourLocal", () => {
  it("rend minuit dans la zone de l'exploitant, pas la projection UTC du jour", () => {
    const t = new Date(2026, 7, 10, 7, 0, 0); // 10 August 2026, 07:00 local
    const debut = debutJourLocal(t);

    expect(debut.getFullYear()).toBe(2026);
    expect(debut.getMonth()).toBe(7);
    expect(debut.getDate()).toBe(10);
    expect(debut.getHours()).toBe(0);
    expect(debut.getMinutes()).toBe(0);
  });

  it("couvre les premières heures du jour, que la projection UTC laissait dehors", () => {
    // The dedup window used `new Date(jourLocal(now))`, the day projected into
    // the UTC frame. East of Greenwich that instant falls *after* local
    // midnight, so an alert emitted in between was invisible to the next run and
    // went out twice. A start of day is never after a moment of that same day —
    // which the projection cannot promise, and this does.
    for (const heure of [0, 1, 7, 23]) {
      const t = new Date(2026, 7, 10, heure, 30, 0);
      expect(debutJourLocal(t).getTime()).toBeLessThanOrEqual(t.getTime());
    }
    // The projection is a day number, not an instant: the two only coincide in
    // the UTC zone.
    expect(jourLocal(new Date(2026, 7, 10))).toBe(Date.UTC(2026, 7, 10));
  });
});
