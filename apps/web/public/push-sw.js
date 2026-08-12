/* Web Push handlers imported into the generated service worker (next-pwa).
   Displays the incoming notification and opens/focuses the page on click. */

const APP_NAME = "KingCity";

// One-off purge of the "apis" cache left by earlier SW versions, which kept
// authenticated responses (invoices, notifications) on the device for 24 h.
// The current strategy is NetworkOnly: that cache is neither read nor written
// anymore, but the entries already stored must disappear from the phone.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("apis").catch(() => {}));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: APP_NAME, body: event.data ? event.data.text() : "" };
  }
  const title = data.title || APP_NAME;
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    // Android renders the badge as a silhouette in the status bar: it keeps the
    // alpha channel and discards the colours. The full app icon came out as an
    // opaque square, so this is the crown alone, white on transparent.
    badge: "/icons/badge-96.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), flagAppBadge()]),
  );
});

/**
 * Marks the installed icon as having something unread. The worker has no way to
 * know the account's real unread count — the push payload carries one message,
 * not the inbox — so it sets the flag form of the badge (a plain dot, no
 * number). The exact count is written by the app itself as soon as a window is
 * open; until then a dot is the honest signal.
 */
function flagAppBadge() {
  if (!self.navigator || typeof self.navigator.setAppBadge !== "function") {
    return Promise.resolve();
  }
  return self.navigator.setAppBadge().catch(() => {});
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  );

  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
      // Compare on the path: `client.url.includes(target)` treated "/" as
      // contained in every URL, and therefore focused any window at all
      // without ever navigating to it.
      const exact = list.find((c) => new URL(c.url).pathname === target.pathname);
      if (exact) return exact.focus();
      const open = list[0];
      if (open && "navigate" in open) {
        const navigated = await open.navigate(target.href).catch(() => null);
        return (navigated ?? open).focus();
      }
      if (clients.openWindow) return clients.openWindow(target.href);
    })(),
  );
});
