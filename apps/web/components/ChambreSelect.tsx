"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";
import { formatXAF } from "@/lib/format";
import { inputCls } from "./ui";

export interface ChambreOption {
  id: string;
  bloc: string;
  numero: string;
  capacite: number;
  loyerAnnuel: number;
  isActive: boolean;
  occupants: { id: string; fullName: string }[];
}

/** How a room is named everywhere it is referred to. */
export function nomChambre(c: { bloc: string; numero: string }): string {
  return `${c.bloc} ${c.numero}`;
}

/**
 * Room a tenant occupies. It is what their rent is read from — the annual
 * tariff lives on the room — so the amount is shown next to each option rather
 * than left to be looked up on another page.
 *
 * A room already full, or retired from service, is listed but not selectable:
 * hiding it would leave the Admin wondering where it went.
 */
export function ChambreSelect({
  value,
  onChange,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: string | null;
  onChange: (roomId: string | null) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const t = useTranslations("chambres");
  const locale = useLocale();
  const [chambres, setChambres] = useState<ChambreOption[] | null>(null);

  useEffect(() => {
    apiFetch("/api/chambres").then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { items: ChambreOption[] };
      setChambres(data.items);
    });
  }, []);

  // Nothing to pick from until rooms exist: an empty dropdown says nothing, so
  // the field says where rooms come from instead.
  if (chambres !== null && chambres.length === 0) {
    return <p className="text-xs text-slate-500">{t("aucuneChambre")}</p>;
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${inputCls} ${className}`}
    >
      <option value="">{t("nonAffectee")}</option>
      {(chambres ?? []).map((c) => {
        // The tenant's own room stays selectable even when it counts as full:
        // they are one of the occupants filling it.
        const complete = c.occupants.length >= c.capacite && c.id !== value;
        return (
          <option key={c.id} value={c.id} disabled={!c.isActive || complete}>
            {nomChambre(c)}
            {c.loyerAnnuel > 0 ? ` — ${formatXAF(c.loyerAnnuel, locale)}` : ` — ${t("sansTarif")}`}
            {!c.isActive ? ` (${t("retiree")})` : complete ? ` (${t("complete")})` : ""}
          </option>
        );
      })}
    </select>
  );
}
