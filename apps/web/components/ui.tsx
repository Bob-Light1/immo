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
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
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
