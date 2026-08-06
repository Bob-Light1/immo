"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";

/**
 * Password field with a show/hide toggle (eye). Accepts every standard <input>
 * prop (value, onChange, required, minLength, …) and reserves room for the
 * button on the right through `pr-10`.
 */
export function PasswordInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const t = useTranslations("common");
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
      >
        {show ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path d="M3 3l18 18" strokeLinecap="round" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.4 2.6-3 4M6.6 6.6C4.4 8 3.2 9.9 2 12c1 2.5 5 7 10 7 1.4 0 2.7-.3 3.9-.9" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
