"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompteurScope, CompteurType } from "@campusgest/shared";
import { apiFetch } from "@/lib/client/session";
import { inputCls } from "./ui";

export interface CompteurOption {
  id: string;
  type: CompteurType;
  libelle: string;
  scope: CompteurScope;
}

/**
 * Meter an invoice is raised against. Optional: rent, cleaning or a
 * contribution measure nothing, so "no meter" stays the default and the empty
 * value means "detach" when correcting a draft.
 */
export function CompteurSelect({
  value,
  onChange,
  className = "",
  filterType,
}: {
  value: string | null;
  onChange: (compteurId: string | null) => void;
  className?: string;
  /** Restricts the list to one kind of meter — a room's is electricity only. */
  filterType?: CompteurType;
}) {
  const t = useTranslations("compteurs");
  const [compteurs, setCompteurs] = useState<CompteurOption[] | null>(null);

  useEffect(() => {
    apiFetch("/api/compteurs").then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { items: CompteurOption[] };
      setCompteurs(filterType ? data.items.filter((c) => c.type === filterType) : data.items);
    });
  }, [filterType]);

  // Nothing to pick from until the Admin has declared a meter: the field would
  // be an empty dropdown, so it says where meters come from instead.
  if (compteurs !== null && compteurs.length === 0) {
    return <p className="text-xs text-slate-500">{t("aucunCompteur")}</p>;
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${inputCls} ${className}`}
    >
      <option value="">{t("aucun")}</option>
      {(compteurs ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.libelle} — {t(`types.${c.type}`)}
        </option>
      ))}
    </select>
  );
}
