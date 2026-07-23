"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Bascule clair / sombre. La préférence est mémorisée dans localStorage
 * (`cg_theme`) ; l'application initiale se fait avant le rendu via un script
 * inline dans le layout (évite le flash). Par défaut : préférence système.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cg_theme", next ? "dark" : "light");
    } catch {
      /* stockage indisponible : la bascule reste effective pour la session */
    }
  }

  // Évite une icône incohérente entre serveur et client avant montage.
  const label = !mounted ? "" : dark ? t("light") : t("dark");

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-100"
    >
      {mounted ? (
        <span aria-hidden className="text-base leading-none">
          {dark ? "☀" : "☾"}
        </span>
      ) : (
        <span aria-hidden className="text-base leading-none">
          ☾
        </span>
      )}
    </button>
  );
}
