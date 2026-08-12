import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { LigneStatut } from "@campusgest/shared";

/** Colored badge for an invoice line's status. */
export function StatutBadge({ statut }: { statut: LigneStatut }) {
  const t = useTranslations("statut");
  const styles: Record<LigneStatut, string> = {
    en_attente: "bg-slate-100 text-slate-700",
    partiel: "bg-amber-100 text-amber-800",
    paye: "bg-emerald-100 text-emerald-800",
    retard: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[statut]}`}>
      {t(statut)}
    </span>
  );
}

/** Draft / published badge for an invoice. */
export function PubBadge({ statut }: { statut: "brouillon" | "publiee" }) {
  const t = useTranslations("statut");
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        statut === "publiee" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      }`}
    >
      {t(statut)}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  /* The default padding is dropped, not layered, when the caller states its
     own. Tailwind emits the `p-*` utilities in scale order, so `p-6` is written
     after `p-0` and `p-4` and — at equal specificity — silently wins over
     both: every `<Card className="p-0">` around a table was in fact inset by
     24px. Axis utilities (`px-*`, `pt-*`) are emitted after `p-*` and already
     override it, so only a whole-padding class has to displace the default. */
  const padding = /(?:^|\s)p-(?:\d|\[)/.test(className) ? "" : "p-6";
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white ${padding} shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-6 text-2xl font-bold text-navy">{children}</h1>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-navy focus:ring-1 focus:ring-navy";

export const btnPrimary =
  "rounded-lg bg-navy px-4 py-2 font-semibold text-white transition hover:bg-navy-dark disabled:opacity-60";

export const btnSecondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";

export const btnBrand =
  "rounded-lg bg-brand px-4 py-2 font-semibold text-white transition hover:bg-brand-soft disabled:opacity-60";

/* ───────────────────────────── Tables ─────────────────────────────
   Every list in the app is a wide table read on a phone. A `w-full` table
   inside an `overflow-x-auto` box never scrolls — it shrinks to the box and the
   browser compresses the columns instead, wrapping amounts mid-number and
   pushing fixed-width inputs and badges past their cell. The shell below gives
   the table a real minimum width so the box scrolls, and the cells default to
   `whitespace-nowrap` so a column grows rather than folding onto itself. */

type CellAlign = "left" | "right" | "center";

const alignCls: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Card + horizontal scroller + table. `minWidth` must be a literal Tailwind
 * class (`min-w-[52rem]`), never an interpolated value — the JIT compiler only
 * sees what is written in the source.
 */
export function TableCard({
  children,
  minWidth = "min-w-[48rem]",
  className = "",
}: {
  children: ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden p-0 ${className}`}>
      {/* Focusable: a scroll region that only responds to a pointer is
          unreachable for anyone navigating with a keyboard. */}
      <div className="overflow-x-auto" tabIndex={0}>
        <table className={`w-full ${minWidth} border-collapse text-sm`}>{children}</table>
      </div>
    </Card>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{children}</tr>
    </thead>
  );
}

/**
 * A header cell. Action columns still need a name — `srOnly` keeps it out of
 * the layout without leaving the column unlabelled for a screen reader.
 */
export function Th({
  children,
  align = "left",
  srOnly = false,
  className = "",
}: {
  children: ReactNode;
  align?: CellAlign;
  srOnly?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-3 font-semibold ${alignCls[align]} ${className}`}
    >
      {srOnly ? <span className="sr-only">{children}</span> : children}
    </th>
  );
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`border-b border-slate-100 last:border-0 ${className}`}>{children}</tr>;
}

/**
 * A body cell. `wrap` opts a column out of the nowrap default — for free text
 * that would otherwise stretch the table far past the viewport.
 */
export function Td({
  children,
  align = "left",
  wrap = false,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  align?: CellAlign;
  wrap?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-3 align-middle ${wrap ? "" : "whitespace-nowrap"} ${alignCls[align]} ${className}`}
    >
      {children}
    </td>
  );
}

/** Row actions: wraps instead of overflowing once a row carries several. */
export function RowActions({
  children,
  align = "right",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {children}
    </div>
  );
}

export const linkAction = "text-xs text-navy underline-offset-2 hover:underline";
export const linkDanger = "text-xs text-red-600 underline-offset-2 hover:underline";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}

export function Spinner() {
  return (
    <div className="flex justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-navy" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="p-8 text-center text-sm text-slate-500">{children}</p>;
}

/** Pagination controls (server lists ?page&limit). Hidden on a single page. */
export function Pager({
  page,
  total,
  limit,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}) {
  const t = useTranslations("pagination");
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        className={`${btnSecondary} px-3 py-1.5 text-sm`}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t("prev")}
      </button>
      <span className="text-sm text-slate-500">{t("info", { page, pages })}</span>
      <button
        className={`${btnSecondary} px-3 py-1.5 text-sm`}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t("next")}
      </button>
    </div>
  );
}
