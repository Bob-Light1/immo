import type { SVGProps } from "react";

/** Visual mark: crown (King) + base (City). Inherits `currentColor`. */
export function CrownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M5 16 3 6l5 3.2L12 4l4 5.2L21 6l-2 10H5Z" />
      <path d="M5 17.6h14V20H5z" />
    </svg>
  );
}

/**
 * KingCity logo. `size` drives the height of both the icon and the text;
 * `iconOnly` renders the crown alone (favicon, narrow screens).
 */
export function Logo({
  size = "md",
  iconOnly = false,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
}) {
  const icon = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <CrownIcon className={`${icon} shrink-0 text-brand`} />
      {!iconOnly && (
        <span className={`font-extrabold tracking-tight text-navy ${text}`}>
          King<span className="text-brand">City</span>
        </span>
      )}
    </span>
  );
}
