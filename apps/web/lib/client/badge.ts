/**
 * App-icon badge (Badging API) — the count the OS draws over the installed
 * PWA's home-screen icon. It is the only notification signal a resident sees
 * without opening the app, so it is kept in step with the bell's unread count.
 *
 * Nothing here is guarded by a capability check beyond the presence of the
 * method: iOS only honours it once the app is installed, desktop Chrome draws
 * it on the taskbar, and everywhere else the call is a no-op. The promise is
 * rejected rather than thrown on an unsupported surface, hence the catch — a
 * badge that cannot be drawn must never surface as an error to the user.
 */

type Badging = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function badging(): Badging | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & Badging;
  return typeof nav.setAppBadge === "function" ? nav : null;
}

/**
 * Reflects the unread count on the icon. Zero clears it: the platforms cap the
 * rendered number anyway, so the value is passed through unclamped and left to
 * the OS to shorten.
 */
export function setUnreadBadge(unread: number): void {
  const nav = badging();
  if (!nav) return;
  if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}

/**
 * Removes the badge. Called on sign-out: the count belongs to the account that
 * is leaving, and the next user of this phone must not inherit it.
 */
export function clearUnreadBadge(): void {
  void badging()?.clearAppBadge?.().catch(() => {});
}
