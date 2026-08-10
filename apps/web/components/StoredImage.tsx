"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * An image held in the object storage (post, portfolio photo, project…).
 *
 * A bare `<img>` fails silently: a missing object, a stale absolute URL written
 * before storage paths went origin-relative, a blocked request — all render as
 * the same empty frame, and the reader is left unable to tell a broken image
 * from a post published without one. This says so instead, and keeps the
 * surrounding layout from collapsing when it happens.
 */
export function StoredImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  /** Applied to the <img> itself. */
  className?: string;
  /** Applied to the placeholder standing in for it, to keep the same footprint. */
  wrapperClassName?: string;
  /** Stands in for the default placeholder — an avatar silhouette, typically. */
  fallback?: ReactNode;
}) {
  const t = useTranslations("common");
  const [failed, setFailed] = useState(false);

  // A feed page re-renders with different posts against the same component
  // instance; without this the previous item's failure would stick.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <div
        role="img"
        aria-label={t("imageUnavailable")}
        className={`flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 ${wrapperClassName || className}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M21 15l-5-5L9.5 16.5M3.5 5.5v13h13" />
        </svg>
        <span className="px-2 text-center text-xs">{t("imageUnavailable")}</span>
      </div>
    );
  }

  return (
    // Plain <img>: in production these bytes are served by the reverse proxy
    // straight from the bucket, never by Next, so the optimizer of `next/image`
    // has nothing to work with here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
