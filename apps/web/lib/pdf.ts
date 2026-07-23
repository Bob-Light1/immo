// Générateur PDF minimal, sans dépendance (économie de bundle/tokens).
// Une seule page A4, police standard Helvetica en WinAnsiEncoding — couvre les
// accents français (Latin-1). Suffit pour les reçus de paiement (conception §5.2).

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

// Glyphes typographiques de la zone 0x80-0x9F propre à WinAnsiEncoding
// (différente de Latin-1) : on les ramène à leur octet WinAnsi.
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

/** Encode une chaîne pour la police WinAnsi (octet par caractère). */
function toLatin1(s: string): string {
  let out = "";
  for (const ch of s) {
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
const BOTTOM_Y = 56; // marge basse : on bascule sur une nouvelle page en dessous

/**
 * Compose un document texte (multi-pages automatique) et renvoie le PDF.
 * Quand le curseur descend sous la marge basse, une nouvelle page démarre.
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
  // Réserve la hauteur `need` ; saute de page si nécessaire.
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
  // Numérotation des objets :
  //  1 Catalog · 2 Pages · 3 Font F1 · 4 Font F2 ·
  //  puis, par page i : Page obj + Content obj.
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

// ─────────────────────────── Reçu de paiement ───────────────────────────

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

function xaf(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} XAF`;
}

// ─────────────────────────── Relevé mensuel récapitulatif ───────────────────────────

export interface RecapLigne {
  type: string;
  mois: string;
  locataire: string;
  montantDu: number;
  montantPaye: number;
  statut: string;
}

export interface RecapData {
  mois: string | null; // null = toutes périodes
  genereLe: Date;
  totalFacture: number;
  totalEncaisse: number;
  lignes: RecapLigne[];
}

function num(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ | /g, " ");
}

/** Relevé récapitulatif des factures (facturé vs encaissé) — Admin / Bailleur (§6). */
export function recapFacturesPdf(d: RecapData): Buffer {
  const reste = Math.max(0, d.totalFacture - d.totalEncaisse);
  const taux = d.totalFacture > 0 ? Math.round((d.totalEncaisse / d.totalFacture) * 100) : 0;
  const periode = d.mois ? d.mois : "toutes périodes";

  // Colonnes du tableau (x en points).
  const COLS = { type: LEFT, mois: 138, loc: 200, du: 348, paye: 430, reste: 508 };

  const lines: Line[] = [
    { kind: "title", text: "KingCity — Relevé des factures" },
    { kind: "subtitle", text: `Période : ${periode} · généré le ${d.genereLe.toLocaleString("fr-FR")}` },
    { kind: "rule" },
    { kind: "gap", h: 4 },
    { kind: "row", label: "Total facturé", value: `${num(d.totalFacture)} XAF` },
    { kind: "row", label: "Total encaissé", value: `${num(d.totalEncaisse)} XAF` },
    { kind: "row", label: "Reste à encaisser", value: `${num(reste)} XAF` },
    { kind: "row", label: "Taux de recouvrement", value: `${taux} %` },
    { kind: "gap", h: 8 },
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
  ];

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

/** Construit le reçu PDF d'un paiement (document officiel, en français). */
export function paiementRecuPdf(d: RecuData): Buffer {
  const reste = Math.max(0, d.montantDu - d.montantPayeCumule);
  const num = d.paiementId.slice(0, 8).toUpperCase();
  return renderTextPdf([
    { kind: "title", text: "KingCity — Reçu de paiement" },
    { kind: "subtitle", text: `Reçu N° ${num} · émis le ${d.date.toLocaleString("fr-FR")}` },
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
