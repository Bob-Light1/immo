import { DEFAULT_LOCALE, LOCALES, type Locale } from "./types";

/**
 * Server-side notification catalogue (design §5.3).
 *
 * Notifications are produced by the API services *and* by the BullMQ workers,
 * so their wording cannot live in `apps/web/messages/*.json` — next-intl is not
 * reachable from the workers package. The catalogue therefore sits here, in the
 * pure shared layer, next to the calculations.
 *
 * A notification row stores the message *key* and its parameters rather than a
 * finished sentence: the recipient may switch language at any time, and a
 * resident who moves to German precisely because they do not read French must
 * find their existing inbox translated too, not only the messages that arrive
 * afterwards. Rendering happens on read (in-app) and on send (push, where no UI
 * locale exists and the account preference is the only signal).
 *
 * User-authored content (announcements, community posts) is deliberately absent:
 * it is free text written by a human and cannot be keyed.
 */

export type NotifParamValue = string | number;
export type NotifParams = Record<string, NotifParamValue>;

interface Template {
  title: string;
  body: string;
}

/** Enumerations interpolated as `{param, <table>}`. */
const ENUMS = {
  ticketStatut: {
    fr: { ouvert: "Ouvert", en_cours: "En cours", resolu: "Résolu" },
    en: { ouvert: "Open", en_cours: "In progress", resolu: "Resolved" },
    de: { ouvert: "Offen", en_cours: "In Bearbeitung", resolu: "Gelöst" },
  },
} as const satisfies Record<string, Record<Locale, Record<string, string>>>;

type EnumName = keyof typeof ENUMS;

/**
 * Domain terms (`facture.type`, ticket categories, period strings such as
 * `2026-06`) stay verbatim: they are identifiers of the residence's own
 * vocabulary, not prose, and translating them would break the match with what
 * the invoice screens display.
 */
const TEMPLATES = {
  // ── Documents ──
  "document.nouveau": {
    fr: { title: "Nouveau document", body: "{titre}" },
    en: { title: "New document", body: "{titre}" },
    de: { title: "Neues Dokument", body: "{titre}" },
  },

  // ── Distress signal (§5.8) ──
  "distress.signal": {
    fr: {
      title: "🚨 Signal de détresse{revue, select, yes { (à vérifier)} other {}}",
      body: "{name} a déclenché un signal de détresse.{position, select, yes { Position partagée.} other {}}",
    },
    en: {
      title: "🚨 Distress signal{revue, select, yes { (to be checked)} other {}}",
      body: "{name} triggered a distress signal.{position, select, yes { Location shared.} other {}}",
    },
    de: {
      title: "🚨 Notsignal{revue, select, yes { (zu prüfen)} other {}}",
      body: "{name} hat ein Notsignal ausgelöst.{position, select, yes { Standort geteilt.} other {}}",
    },
  },
  "distress.revue": {
    fr: {
      title: "Signal de détresse en revue anti-abus",
      body: "{name} dépasse le seuil de signaux récents. À arbitrer (revue / ban).",
    },
    en: {
      title: "Distress signal under abuse review",
      body: "{name} is over the recent-signal threshold. Needs a decision (review / ban).",
    },
    de: {
      title: "Notsignal in Missbrauchsprüfung",
      body: "{name} überschreitet den Schwellenwert für kürzliche Signale. Entscheidung nötig (Prüfung / Sperre).",
    },
  },
  // `nomConnu` guards against a deleted sender: the fallback wording has to be
  // translated too, so it lives in the template rather than at the call site.
  "distress.position": {
    fr: {
      title: "📍 Position reçue — signal de détresse",
      body: "{nomConnu, select, yes {{name}} other {Un résident}} : {latitude}, {longitude}",
    },
    en: {
      title: "📍 Location received — distress signal",
      body: "{nomConnu, select, yes {{name}} other {A resident}}: {latitude}, {longitude}",
    },
    de: {
      title: "📍 Standort empfangen — Notsignal",
      body: "{nomConnu, select, yes {{name}} other {Ein Bewohner}}: {latitude}, {longitude}",
    },
  },

  // ── Maintenance tickets (§5.12) ──
  "ticket.nouveau": {
    fr: { title: "Nouveau ticket de maintenance", body: "{categorie} — {description}" },
    en: { title: "New maintenance ticket", body: "{categorie} — {description}" },
    de: { title: "Neues Wartungsticket", body: "{categorie} — {description}" },
  },
  "ticket.statut": {
    fr: {
      title: "Mise à jour de votre ticket",
      body: "Votre ticket « {categorie} » est maintenant : {statut, ticketStatut}.",
    },
    en: {
      title: "Your ticket has been updated",
      body: "Your ticket “{categorie}” is now: {statut, ticketStatut}.",
    },
    de: {
      title: "Ihr Ticket wurde aktualisiert",
      body: "Ihr Ticket „{categorie}“ ist jetzt: {statut, ticketStatut}.",
    },
  },

  // ── Events (§5.5) ──
  "evenement.approuve": {
    fr: {
      title: "Nouvel événement : {titre}",
      body: "Le {date, date} à {heure}. Proposé et approuvé par l'administration.",
    },
    en: {
      title: "New event: {titre}",
      body: "On {date, date} at {heure}. Proposed and approved by the administration.",
    },
    de: {
      title: "Neue Veranstaltung: {titre}",
      body: "Am {date, date} um {heure}. Vorgeschlagen und von der Verwaltung genehmigt.",
    },
  },
  "evenement.refuse": {
    fr: {
      title: "Événement refusé : {titre}",
      body: "Votre proposition d'événement n'a pas été retenue par l'administration.",
    },
    en: {
      title: "Event rejected: {titre}",
      body: "Your event proposal was not accepted by the administration.",
    },
    de: {
      title: "Veranstaltung abgelehnt: {titre}",
      body: "Ihr Veranstaltungsvorschlag wurde von der Verwaltung nicht angenommen.",
    },
  },

  // ── Suggestions (§5.4) ──
  "suggestion.lue": {
    fr: {
      title: "Suggestion consultée",
      body: "L'administration a consulté votre suggestion. Merci pour votre contribution.",
    },
    en: {
      title: "Suggestion reviewed",
      body: "The administration has read your suggestion. Thank you for your contribution.",
    },
    de: {
      title: "Vorschlag gelesen",
      body: "Die Verwaltung hat Ihren Vorschlag gelesen. Vielen Dank für Ihren Beitrag.",
    },
  },

  // ── Cost estimates (§5.14) ──
  "prediction.publiee": {
    fr: {
      title: "Estimation {type} — {mois}",
      body: "Estimation publiée : {montant, xaf} au total.{part, select, yes { Part estimée par locataire : {partMontant, xaf}.} other {}} Pour anticiper la charge du mois.",
    },
    en: {
      title: "Estimate {type} — {mois}",
      body: "Estimate published: {montant, xaf} in total.{part, select, yes { Estimated share per tenant: {partMontant, xaf}.} other {}} To anticipate this month's charge.",
    },
    de: {
      title: "Schätzung {type} — {mois}",
      body: "Schätzung veröffentlicht: insgesamt {montant, xaf}.{part, select, yes { Geschätzter Anteil je Mieter: {partMontant, xaf}.} other {}} Zur Vorbereitung auf die Kosten des Monats.",
    },
  },

  // ── Invoice published (§5.1) ──
  "facture.publiee": {
    fr: {
      title: "Nouvelle facture — {type} {periode}",
      body: "Votre part s'élève à {montant, xaf}, à régler avant le {echeance, date}.",
    },
    en: {
      title: "New invoice — {type} {periode}",
      body: "Your share is {montant, xaf}, due by {echeance, date}.",
    },
    de: {
      title: "Neue Rechnung — {type} {periode}",
      body: "Ihr Anteil beträgt {montant, xaf}, zahlbar bis zum {echeance, date}.",
    },
  },
  "facture.publieeLoyer": {
    fr: {
      title: "Nouvelle facture — {type} {periode}",
      body: "Votre loyer {periode} s'élève à {montant, xaf} pour l'année, à régler par versements avant le {echeance, date}.",
    },
    en: {
      title: "New invoice — {type} {periode}",
      body: "Your {periode} rent is {montant, xaf} for the year, payable in instalments by {echeance, date}.",
    },
    de: {
      title: "Neue Rechnung — {type} {periode}",
      body: "Ihre Miete {periode} beträgt {montant, xaf} für das Jahr, in Raten zahlbar bis zum {echeance, date}.",
    },
  },

  // ── Due-date milestones (§5.1) ──
  // Rent carries a balance that is *expected* to stay open all year, so it is
  // phrased as a remaining balance rather than an overdue bill.
  "echeance.avant": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Votre facture {type} ({periode}) de {reste, xaf} arrive à échéance dans {jours, plural, one {# jour} other {# jours}}.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "Your {type} invoice ({periode}) of {reste, xaf} is due in {jours, plural, one {# day} other {# days}}.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Ihre Rechnung {type} ({periode}) über {reste, xaf} ist in {jours, plural, one {# Tag} other {# Tagen}} fällig.",
    },
  },
  "echeance.jour": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Votre facture {type} ({periode}) de {reste, xaf} arrive à échéance aujourd'hui.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "Your {type} invoice ({periode}) of {reste, xaf} is due today.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Ihre Rechnung {type} ({periode}) über {reste, xaf} ist heute fällig.",
    },
  },
  "echeance.retard": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Votre facture {type} ({periode}) de {reste, xaf} est en retard de {jours, plural, one {# jour} other {# jours}}.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "Your {type} invoice ({periode}) of {reste, xaf} is {jours, plural, one {# day} other {# days}} overdue.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Ihre Rechnung {type} ({periode}) über {reste, xaf} ist seit {jours, plural, one {# Tag} other {# Tagen}} überfällig.",
    },
  },
  "echeance.loyerAvant": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Il vous reste {reste, xaf} à verser sur votre loyer {periode}, à solder dans {jours, plural, one {# jour} other {# jours}}.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "You still owe {reste, xaf} on your {periode} rent, to be settled within {jours, plural, one {# day} other {# days}}.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Sie schulden noch {reste, xaf} auf Ihre Miete {periode}, zu begleichen in {jours, plural, one {# Tag} other {# Tagen}}.",
    },
  },
  "echeance.loyerJour": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Il vous reste {reste, xaf} à verser sur votre loyer {periode}, à solder aujourd'hui.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "You still owe {reste, xaf} on your {periode} rent, to be settled today.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Sie schulden noch {reste, xaf} auf Ihre Miete {periode}, heute zu begleichen.",
    },
  },
  "echeance.loyerRetard": {
    fr: {
      title: "Échéance {jalon} — {type} {periode}",
      body: "Votre loyer {periode} n'est pas soldé : {reste, xaf} restent dus depuis {jours, plural, one {# jour} other {# jours}}.",
    },
    en: {
      title: "Due {jalon} — {type} {periode}",
      body: "Your {periode} rent is not settled: {reste, xaf} still due for {jours, plural, one {# day} other {# days}}.",
    },
    de: {
      title: "Fällig {jalon} — {type} {periode}",
      body: "Ihre Miete {periode} ist nicht beglichen: {reste, xaf} seit {jours, plural, one {# Tag} other {# Tagen}} offen.",
    },
  },

  // ── Birthdays (§5.6) ──
  anniversaire: {
    fr: {
      title: "Anniversaire de {name}",
      body: "C'est bientôt l'anniversaire de {name}, le {date, dayMonth}. Pensez à lui souhaiter !",
    },
    en: {
      title: "{name}'s birthday",
      body: "It is {name}'s birthday soon, on {date, dayMonth}. Do not forget to send your wishes!",
    },
    de: {
      title: "Geburtstag von {name}",
      body: "Bald hat {name} Geburtstag, am {date, dayMonth}. Denken Sie daran zu gratulieren!",
    },
  },

  // ── Monthly roll-over (§5.1) ──
  "reconduction.brouillon": {
    fr: {
      title: "Facture reconduite à valider — {type} {mois}",
      body: "Un brouillon de la facture {type} a été reconduit depuis {moisPrecedent}. Vérifiez le montant puis publiez.",
    },
    en: {
      title: "Rolled-over invoice to validate — {type} {mois}",
      body: "A draft of the {type} invoice was rolled over from {moisPrecedent}. Check the amount, then publish.",
    },
    de: {
      title: "Übertragene Rechnung zu prüfen — {type} {mois}",
      body: "Ein Entwurf der Rechnung {type} wurde aus {moisPrecedent} übertragen. Prüfen Sie den Betrag und veröffentlichen Sie ihn.",
    },
  },
  "reconduction.repetee": {
    fr: {
      title: "Reconduction répétée — {type}",
      body: "La facture {type} est reconduite depuis {streak, plural, one {# mois consécutif} other {# mois consécutifs}}. Confirmez que le montant est toujours correct.",
    },
    en: {
      title: "Repeated roll-over — {type}",
      body: "The {type} invoice has been rolled over for {streak, plural, one {# consecutive month} other {# consecutive months}}. Confirm the amount is still correct.",
    },
    de: {
      title: "Wiederholte Übertragung — {type}",
      body: "Die Rechnung {type} wird seit {streak, plural, one {# aufeinanderfolgenden Monat} other {# aufeinanderfolgenden Monaten}} übertragen. Bestätigen Sie, dass der Betrag noch stimmt.",
    },
  },
} as const satisfies Record<string, Record<Locale, Template>>;

export type NotifKey = keyof typeof TEMPLATES;

export const NOTIF_KEYS = Object.keys(TEMPLATES) as NotifKey[];

export function isNotifKey(value: unknown): value is NotifKey {
  return typeof value === "string" && value in TEMPLATES;
}

// ─────────────────────────── Rendering ───────────────────────────

/**
 * Minimal ICU subset: `{name}`, `{name, <formatter>}`,
 * `{name, select, opt {…} other {…}}` and `{name, plural, one {…} other {…}}`
 * (`#` substitutes the count). Option bodies are rendered recursively, so a
 * placeholder may appear inside a branch.
 *
 * Written by hand rather than pulled from a formatting library: the workers
 * package must stay dependency-light, and the catalogue only needs these four
 * forms. Anything richer belongs in the UI messages, not here.
 */
function formatValue(value: NotifParamValue, formatter: string, locale: Locale): string {
  switch (formatter) {
    case "xaf":
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "XAF",
        maximumFractionDigits: 0,
      }).format(Number(value));
    case "date":
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
    case "dayMonth":
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
        new Date(value),
      );
    default:
      if (formatter in ENUMS) {
        const table = ENUMS[formatter as EnumName][locale] as Record<string, string>;
        return table[String(value)] ?? String(value);
      }
      return String(value);
  }
}

/** Reads a `{…}` block starting at `start` and returns its inner text. */
function readBlock(input: string, start: number): { inner: string; end: number } | null {
  if (input[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "{") depth++;
    else if (input[i] === "}") {
      depth--;
      if (depth === 0) return { inner: input.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Parses `opt {…} other {…}` into an option map. */
function parseOptions(input: string): Record<string, string> {
  const options: Record<string, string> = {};
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i++;
    const nameStart = i;
    while (i < input.length && !/[\s{]/.test(input[i]!)) i++;
    const name = input.slice(nameStart, i);
    while (i < input.length && /\s/.test(input[i]!)) i++;
    const block = readBlock(input, i);
    if (!name || !block) break;
    options[name] = block.inner;
    i = block.end;
  }
  return options;
}

function render(template: string, params: NotifParams, locale: Locale): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "{") {
      out += template[i];
      i++;
      continue;
    }
    const block = readBlock(template, i);
    if (!block) {
      // Unbalanced brace: emit it verbatim rather than swallowing the rest.
      out += template[i];
      i++;
      continue;
    }
    i = block.end;

    const comma = block.inner.indexOf(",");
    const name = (comma === -1 ? block.inner : block.inner.slice(0, comma)).trim();
    const value = params[name];
    if (comma === -1) {
      out += value === undefined ? "" : String(value);
      continue;
    }

    const rest = block.inner.slice(comma + 1).trim();
    const secondComma = rest.indexOf(",");
    const kind = (secondComma === -1 ? rest : rest.slice(0, secondComma)).trim();

    if (kind === "select" || kind === "plural") {
      const options = parseOptions(rest.slice(secondComma + 1));
      const selector =
        kind === "plural"
          ? new Intl.PluralRules(locale).select(Number(value))
          : String(value ?? "other");
      const chosen = options[selector] ?? options.other ?? "";
      out += render(chosen.replace(/#/g, String(value ?? "")), params, locale);
      continue;
    }

    out += value === undefined ? "" : formatValue(value, kind, locale);
  }
  return out;
}

function resolveLocale(locale: string | null | undefined): Locale {
  return LOCALES.includes(locale as Locale) ? (locale as Locale) : DEFAULT_LOCALE;
}

/**
 * Renders a catalogue entry. An unknown key yields `null` so callers can fall
 * back to the literal title/body stored alongside it — rows written before the
 * catalogue existed, and announcements, have no key.
 */
export function renderNotif(
  key: string,
  locale: string | null | undefined,
  params: NotifParams = {},
): Template | null {
  if (!isNotifKey(key)) return null;
  const loc = resolveLocale(locale);
  const template = TEMPLATES[key][loc];
  return { title: render(template.title, params, loc), body: render(template.body, params, loc) };
}
