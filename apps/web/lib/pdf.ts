// Minimal, dependency-free PDF generator (keeps the bundle small).
// Single A4 page, standard Helvetica font in WinAnsiEncoding — covers French
// accents (Latin-1). Enough for payment receipts (design §5.2).

type Cell = { text: string; x: number; bold?: boolean };

type Line =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "text"; text: string; bold?: boolean; size?: number }
  | { kind: "row"; label: string; value: string }
  | { kind: "cols"; cells: Cell[]; bold?: boolean; size?: number }
  | { kind: "rule" }
  | { kind: "gap"; h?: number };

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Typographic glyphs from the 0x80-0x9F range specific to WinAnsiEncoding
// (which differs from Latin-1): map them back to their WinAnsi byte.
const WINANSI: Record<number, number> = {
  0x20ac: 0x80, // €
  0x2026: 0x85, // …
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
};

/**
 * No-break spaces that WinAnsi cannot render, folded to a plain space before
 * encoding. `toLocaleString("fr-FR")` groups thousands with U+202F, which has
 * no WinAnsi byte and would otherwise reach the reader as "15?000".
 * Written as escapes so an ASCII-normalising pass over the file cannot quietly
 * turn them into ordinary spaces and make this a no-op.
 */
const NBSP = /[\u202f\u2009\u00a0]/g;

/** Encodes a string for the WinAnsi font (one byte per character). */
function toLatin1(s: string): string {
  let out = "";
  for (const ch of s.replace(NBSP, " ")) {
    const c = ch.codePointAt(0)!;
    if (WINANSI[c] !== undefined) out += String.fromCharCode(WINANSI[c]);
    else if (c >= 0x20 && c <= 0xff && !(c >= 0x80 && c <= 0x9f)) out += ch;
    else out += "?";
  }
  return out;
}

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 56;
const RIGHT = PAGE_W - 56;
const VALUE_X = 240;
const TOP_Y = PAGE_H - 64;
const BOTTOM_Y = 56; // bottom margin: below it a new page starts

/**
 * Composes a text document (automatic pagination) and returns the PDF.
 * When the cursor drops below the bottom margin, a new page starts.
 */
export function renderTextPdf(lines: Line[]): Buffer {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = TOP_Y;

  const flush = () => {
    pages.push(ops.join("\n"));
    ops = [];
    y = TOP_Y;
  };
  // Reserves `need` height; breaks to a new page when required.
  const ensure = (need: number) => {
    if (y - need < BOTTOM_Y && ops.length > 0) flush();
  };
  const draw = (x: number, font: "F1" | "F2", size: number, s: string) =>
    ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(toLatin1(s))}) Tj ET`);

  for (const ln of lines) {
    switch (ln.kind) {
      case "title":
        ensure(30);
        draw(LEFT, "F2", 20, ln.text);
        y -= 30;
        break;
      case "subtitle":
        ensure(24);
        draw(LEFT, "F1", 10, ln.text);
        y -= 24;
        break;
      case "text":
        ensure((ln.size ?? 11) + 7);
        draw(LEFT, ln.bold ? "F2" : "F1", ln.size ?? 11, ln.text);
        y -= (ln.size ?? 11) + 7;
        break;
      case "row":
        ensure(19);
        draw(LEFT, "F1", 11, ln.label);
        draw(VALUE_X, "F2", 11, ln.value);
        y -= 19;
        break;
      case "cols": {
        const size = ln.size ?? 10;
        ensure(size + 6);
        for (const c of ln.cells) draw(c.x, c.bold || ln.bold ? "F2" : "F1", size, c.text);
        y -= size + 6;
        break;
      }
      case "rule":
        ensure(12);
        ops.push(`${LEFT} ${y + 7} m ${RIGHT} ${y + 7} l 0.8 w 0.7 0.7 0.7 RG S`);
        y -= 12;
        break;
      case "gap":
        y -= ln.h ?? 12;
        break;
    }
  }
  flush();
  return assemble(pages);
}

function assemble(pages: string[]): Buffer {
  if (pages.length === 0) pages = [""];
  // Object numbering:
  //  1 Catalog · 2 Pages · 3 Font F1 · 4 Font F2 ·
  //  then, per page i: Page obj + Content obj.
  const fontF1 = 3;
  const fontF2 = 4;
  const firstPageObj = 5;
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`);

  const objs: string[] = [
    "<</Type /Catalog /Pages 2 0 R>>",
    `<</Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length}>>`,
    "<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>",
    "<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>",
  ];
  pages.forEach((content, i) => {
    const contentObj = firstPageObj + i * 2 + 1;
    objs.push(
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources <</Font <</F1 ${fontF1} 0 R /F2 ${fontF2} 0 R>>>> /Contents ${contentObj} 0 R>>`,
    );
    objs.push(`<</Length ${Buffer.byteLength(content, "latin1")}>>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objs.length + 1} /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

// ─────────────────────────── Payment receipt ───────────────────────────

export interface RecuData {
  paiementId: string;
  date: Date;
  montant: number;
  mode: string;
  reference: string | null;
  locataire: string;
  factureType: string;
  factureMois: string;
  montantDu: number;
  montantPayeCumule: number;
  encaissePar: string;
}

const MODE_LABELS: Record<string, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  virement: "Virement",
};

/**
 * PDFs are issued in French whatever the reader's interface language, and that
 * is a decision rather than an oversight: invoices and receipts are accounting
 * records of a Cameroonian residence, filed and audited in the administration's
 * own language. A receipt whose wording changed with whoever downloaded it
 * would no longer match the copy kept on file.
 *
 * Every locale-dependent rendering in this module goes through this constant,
 * so the decision can be revisited in one place.
 */
const PDF_LOCALE = "fr-FR";

function xaf(n: number): string {
  return `${n.toLocaleString(PDF_LOCALE)} XAF`;
}

// ─────────────────────────── Monthly summary statement ───────────────────────────

export interface RecapLigne {
  type: string;
  mois: string;
  locataire: string;
  montantDu: number;
  montantPaye: number;
  statut: string;
}

export interface RecapData {
  mois: string | null; // null = all periods
  genereLe: Date;
  totalFacture: number;
  totalEncaisse: number;
  lignes: RecapLigne[];
  /**
   * Line cap the export stopped at, or `null` when the period fits whole. The
   * totals below are computed over the lines actually read, so a capped
   * statement must say so on its face: it leaves the application and is read as
   * the period's accounts.
   */
  tronqueA: number | null;
}

function num(n: number): string {
  return n.toLocaleString(PDF_LOCALE);
}

/** Invoice summary statement (billed vs collected) — Admin / Bailleur (§6). */
export function recapFacturesPdf(d: RecapData): Buffer {
  const reste = Math.max(0, d.totalFacture - d.totalEncaisse);
  const taux = d.totalFacture > 0 ? Math.round((d.totalEncaisse / d.totalFacture) * 100) : 0;
  const periode = d.mois ? d.mois : "toutes périodes";

  // Table columns (x in points).
  const COLS = { type: LEFT, mois: 138, loc: 200, du: 348, paye: 430, reste: 508 };

  const lines: Line[] = [
    { kind: "title", text: "KingCity — Relevé des factures" },
    { kind: "subtitle", text: `Période : ${periode} · généré le ${d.genereLe.toLocaleString(PDF_LOCALE)}` },
    { kind: "rule" },
    { kind: "gap", h: 4 },
    { kind: "row", label: "Total facturé", value: `${num(d.totalFacture)} XAF` },
    { kind: "row", label: "Total encaissé", value: `${num(d.totalEncaisse)} XAF` },
    { kind: "row", label: "Reste à encaisser", value: `${num(reste)} XAF` },
    { kind: "row", label: "Taux de recouvrement", value: `${taux} %` },
    { kind: "gap", h: 8 },
  ];

  if (d.tronqueA !== null) {
    lines.push(
      {
        kind: "text",
        text: `RELEVÉ PARTIEL — export limité à ${num(d.tronqueA)} lignes.`,
        bold: true,
        size: 11,
      },
      {
        kind: "text",
        text: "Les totaux ci-dessus ne portent que sur les lignes listées. Filtrez par mois pour obtenir un relevé complet.",
        size: 9,
      },
      { kind: "gap", h: 8 },
    );
  }

  lines.push(
    { kind: "text", text: `Détail (${d.lignes.length} ligne(s)) — montants en XAF`, bold: true, size: 11 },
    { kind: "gap", h: 2 },
    {
      kind: "cols",
      bold: true,
      cells: [
        { text: "Type", x: COLS.type },
        { text: "Mois", x: COLS.mois },
        { text: "Locataire", x: COLS.loc },
        { text: "Dû", x: COLS.du },
        { text: "Payé", x: COLS.paye },
        { text: "Reste", x: COLS.reste },
      ],
    },
    { kind: "rule" },
  );

  for (const l of d.lignes) {
    const r = Math.max(0, l.montantDu - l.montantPaye);
    lines.push({
      kind: "cols",
      cells: [
        { text: l.type.slice(0, 14), x: COLS.type },
        { text: l.mois, x: COLS.mois },
        { text: l.locataire.slice(0, 24), x: COLS.loc },
        { text: num(l.montantDu), x: COLS.du },
        { text: num(l.montantPaye), x: COLS.paye },
        { text: num(r), x: COLS.reste },
      ],
    });
  }

  lines.push({ kind: "rule" }, { kind: "gap", h: 8 });
  lines.push({
    kind: "text",
    text: "Document généré automatiquement par KingCity.",
    size: 8,
  });

  return renderTextPdf(lines);
}

// ─────────────────────────── Tenant invoice ───────────────────────────

export interface FactureLigneData {
  ligneId: string;
  genereLe: Date;
  locataire: string;
  type: string;
  mois: string;
  dateLimite: Date;
  coefficient: number;
  montantTotalFacture: number;
  montantDu: number;
  montantPaye: number;
  /** Rent regime: flat annual amount, no split. */
  loyer: boolean;
  suivi: { payeCeMois: number; payeAnnee: number; restantAnnee: number } | null;
  paiements: { montant: number; mode: string; reference: string | null; date: Date }[];
}

/**
 * A tenant's personal invoice (§5.1). The receipt attests to a payment; this
 * document carries the debt and its status. For rent, it shows the annual
 * tracking expected after each payment.
 */
export function factureLocatairePdf(d: FactureLigneData): Buffer {
  const reste = Math.max(0, d.montantDu - d.montantPaye);
  const ref = d.ligneId.slice(0, 8).toUpperCase();
  const annee = d.mois.slice(0, 4);

  const lines: Line[] = [
    { kind: "title", text: `KingCity — Facture ${d.loyer ? "de loyer" : d.type}` },
    { kind: "subtitle", text: `Facture N° ${ref} · éditée le ${d.genereLe.toLocaleString(PDF_LOCALE)}` },
    { kind: "rule" },
    { kind: "gap", h: 4 },
    { kind: "row", label: "Locataire", value: d.locataire },
    { kind: "row", label: "Type", value: d.type },
    { kind: "row", label: d.loyer ? "Année couverte" : "Mois concerné", value: d.loyer ? annee : d.mois },
    { kind: "row", label: "Date limite de paiement", value: d.dateLimite.toLocaleDateString(PDF_LOCALE) },
    { kind: "gap", h: 6 },
    { kind: "rule" },
  ];

  if (d.loyer && d.suivi) {
    lines.push(
      { kind: "row", label: "Loyer annuel dû", value: xaf(d.montantDu) },
      { kind: "row", label: "Versé ce mois-ci", value: xaf(d.suivi.payeCeMois) },
      { kind: "row", label: `Déjà versé pour ${annee}`, value: xaf(d.suivi.payeAnnee) },
      { kind: "row", label: `Restant pour ${annee}`, value: xaf(d.suivi.restantAnnee) },
    );
  } else {
    lines.push(
      { kind: "row", label: "Montant total de la facture", value: xaf(d.montantTotalFacture) },
      { kind: "row", label: "Coefficient appliqué", value: String(d.coefficient) },
      { kind: "row", label: "Montant à ma charge", value: xaf(d.montantDu) },
      { kind: "row", label: "Déjà payé", value: xaf(d.montantPaye) },
      { kind: "row", label: "Reste à payer", value: xaf(reste) },
    );
  }

  lines.push({ kind: "rule" }, { kind: "gap", h: 8 });

  if (d.paiements.length > 0) {
    const COLS = { date: LEFT, montant: 200, mode: 320, ref: 440 };
    lines.push(
      { kind: "text", text: "Versements enregistrés", bold: true, size: 11 },
      { kind: "gap", h: 2 },
      {
        kind: "cols",
        bold: true,
        cells: [
          { text: "Date", x: COLS.date },
          { text: "Montant (XAF)", x: COLS.montant },
          { text: "Mode", x: COLS.mode },
          { text: "Référence", x: COLS.ref },
        ],
      },
      { kind: "rule" },
    );
    for (const p of d.paiements) {
      lines.push({
        kind: "cols",
        cells: [
          { text: p.date.toLocaleDateString(PDF_LOCALE), x: COLS.date },
          { text: num(p.montant), x: COLS.montant },
          { text: MODE_LABELS[p.mode] ?? p.mode, x: COLS.mode },
          { text: (p.reference ?? "—").slice(0, 18), x: COLS.ref },
        ],
      });
    }
    lines.push({ kind: "rule" });
  } else {
    lines.push({ kind: "text", text: "Aucun versement enregistré à ce jour.", size: 10 });
  }

  lines.push(
    { kind: "gap", h: 20 },
    {
      kind: "text",
      text: "Document généré automatiquement par KingCity. Les versements sont attestés par les reçus correspondants.",
      size: 8,
    },
  );

  return renderTextPdf(lines);
}

/** Builds a payment's PDF receipt (official document, written in French). */
export function paiementRecuPdf(d: RecuData): Buffer {
  const reste = Math.max(0, d.montantDu - d.montantPayeCumule);
  const num = d.paiementId.slice(0, 8).toUpperCase();
  return renderTextPdf([
    { kind: "title", text: "KingCity — Reçu de paiement" },
    { kind: "subtitle", text: `Reçu N° ${num} · émis le ${d.date.toLocaleString(PDF_LOCALE)}` },
    { kind: "rule" },
    { kind: "gap", h: 4 },
    { kind: "row", label: "Locataire", value: d.locataire },
    { kind: "row", label: "Facture", value: `${d.factureType} — ${d.factureMois}` },
    { kind: "gap", h: 6 },
    { kind: "row", label: "Montant réglé", value: xaf(d.montant) },
    { kind: "row", label: "Mode de paiement", value: MODE_LABELS[d.mode] ?? d.mode },
    ...(d.reference ? [{ kind: "row" as const, label: "Référence", value: d.reference }] : []),
    { kind: "gap", h: 6 },
    { kind: "rule" },
    { kind: "row", label: "Montant total dû", value: xaf(d.montantDu) },
    { kind: "row", label: "Total payé", value: xaf(d.montantPayeCumule) },
    { kind: "row", label: "Reste à payer", value: xaf(reste) },
    { kind: "rule" },
    { kind: "gap", h: 10 },
    { kind: "text", text: `Encaissé par : ${d.encaissePar}`, size: 10 },
    { kind: "gap", h: 24 },
    {
      kind: "text",
      text: "Document généré automatiquement par KingCity. Conservez ce reçu comme preuve de paiement.",
      size: 8,
    },
  ]);
}
