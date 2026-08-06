/* Handlers Web Push importés dans le service worker généré (next-pwa).
   Affiche la notification reçue et ouvre/focus la page au clic. */

const APP_NAME = "KingCity";

// Purge unique du cache "apis" laissé par les versions précédentes du SW, qui
// stockaient 24 h les réponses authentifiées (factures, notifications) sur
// l'appareil. La stratégie actuelle est NetworkOnly : ce cache n'est plus ni lu
// ni écrit, mais les entrées déjà présentes doivent disparaître du téléphone.
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
    badge: "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  );

  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
      // Comparaison sur le chemin : `client.url.includes(target)` considérait "/"
      // comme contenu dans toute URL et focalisait donc n'importe quelle fenêtre
      // sans jamais y naviguer.
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
