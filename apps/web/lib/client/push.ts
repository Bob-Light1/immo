import { apiFetch } from "./session";

/** Abonnement Web Push côté navigateur (conception §5.3 / §7.2). */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

// En dev le service worker est désactivé : `ready` ne résout jamais, d'où le timeout.
function swReady(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

/** Demande la permission puis abonne l'appareil. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await swReady();
  if (!reg) return { ok: false, reason: "no-sw" };

  const res = await apiFetch("/api/push/vapid");
  if (!res.ok) return { ok: false, reason: "vapid" };
  const { enabled, publicKey } = (await res.json()) as { enabled: boolean; publicKey: string };
  if (!enabled || !publicKey) return { ok: false, reason: "disabled" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const save = await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub.toJSON()),
  });
  return { ok: save.ok, reason: save.ok ? undefined : "save" };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await swReady();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await apiFetch("/api/push/unsubscribe", { method: "POST" });
}
