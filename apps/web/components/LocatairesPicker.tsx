"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/client/session";

interface Locataire {
  id: string;
  fullName: string;
}

/**
 * Tenants attached to an invoice.
 *
 * `null` means "every active tenant", which is what an invoice defaults to and
 * what the vast majority of them stay. An explicit list is the exception —
 * a charge shared by part of the residence, or a roster to fix on a draft
 * whose tenants have changed since it was written.
 */
export function LocatairesPicker({
  value,
  onChange,
  autoriseTous = true,
}: {
  value: string[] | null;
  onChange: (ids: string[] | null) => void;
  /**
   * Correcting a draft states the roster explicitly — there is no "all active"
   * shorthand there, since the point is to say who is on this invoice.
   */
  autoriseTous?: boolean;
}) {
  const t = useTranslations("factures.locatairesPicker");
  const [locataires, setLocataires] = useState<Locataire[] | null>(null);

  useEffect(() => {
    // 100 is the API's page ceiling and well past a residence's headcount.
    apiFetch("/api/users?role=locataire&active=1&limit=100").then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { items: Locataire[] };
      setLocataires(data.items);
    });
  }, []);

  const tous = autoriseTous && value === null;

  function toggle(id: string) {
    const courant = value ?? locataires?.map((l) => l.id) ?? [];
    const suivant = courant.includes(id) ? courant.filter((x) => x !== id) : [...courant, id];
    onChange(suivant);
  }

  return (
    <div className="space-y-2">
      {autoriseTous && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tous}
            onChange={(e) => onChange(e.target.checked ? null : (locataires?.map((l) => l.id) ?? []))}
          />
          <span>{t("tous")}</span>
        </label>
      )}

      {!tous && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {locataires === null ? (
            <p className="text-xs text-slate-500">…</p>
          ) : (
            locataires.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value?.includes(l.id) ?? false}
                  onChange={() => toggle(l.id)}
                />
                <span>{l.fullName}</span>
              </label>
            ))
          )}
          {value?.length === 0 && <p className="text-xs text-red-600">{t("aucun")}</p>}
        </div>
      )}
    </div>
  );
}
