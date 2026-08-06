"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Light / dark toggle. The preference is stored in localStorage (`cg_theme`);
 * the initial application happens before render through an inline script in the
 * layout (avoids the flash). Default: the system preference.
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
      /* storage unavailable: the toggle still applies for this session */
    }
  }

  // Avoids an icon mismatch between server and client before mount.
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
