import IORedis from "ioredis";

/**
 * Real-time notification relay (design §8.3).
 *
 * The SSE stream used to poll the database every 8 s per connected client: 200
 * connected residents meant a steady 50 requests/s, even with nothing happening.
 * Redis now acts as a bus: a notification created — by the app or by a worker
 * job in another process — publishes a signal, and only the affected
 * connections go back to the database.
 *
 * The signal carries recipients only, never content: the database stays the
 * source of truth and a lost message cannot produce a phantom notification. A
 * slow poll (SAFETY_POLL_MS) remains as a safety net.
 */

export interface NotifBump {
  userIds?: string[];
  roles?: string[];
}

export const NOTIF_CHANNEL = "cg:notif";

/** Fallback poll interval while the Redis relay is up. */
export const SAFETY_POLL_MS = 30_000;
/** Interval when Redis is unavailable: polling alone takes over. */
export const FALLBACK_POLL_MS = 8_000;

function redisUrl(): string | null {
  return process.env.REDIS_URL ?? null;
}

// ─────────────────────────────── Publication ───────────────────────────────

let publisher: IORedis | null = null;
let lastErrorLog = 0;

// ioredis retries the connection forever: without throttling, a Redis outage
// would drown the logs. Log at most once a minute, and never disable the
// publisher (reconnection must stay possible).
function logThrottled(prefix: string, message: string): void {
  const now = Date.now();
  if (now - lastErrorLog < 60_000) return;
  lastErrorLog = now;
  console.error(prefix, message);
}

function getPublisher(): IORedis | null {
  const url = redisUrl();
  if (!url) return null;
  if (!publisher) {
    publisher = new IORedis(url, {
      maxRetriesPerRequest: 1,
      // Never hold an API response waiting for a reconnection: otherwise
      // publish() would sit queued for the whole outage.
      enableOfflineQueue: false,
    });
    publisher.on("error", (e) => logThrottled("[realtime] publisher", e.message));
  }
  return publisher;
}

/**
 * Signals that new notifications exist for these recipients.
 * Best-effort: a Redis outage degrades to polling, it never fails the business
 * action that just wrote the notification.
 */
export function publishNotif(bump: NotifBump): void {
  const client = getPublisher();
  if (!client) return;
  client.publish(NOTIF_CHANNEL, JSON.stringify(bump)).catch(() => {});
}

// ─────────────────────────────── Subscription ────────────────────────────────

type Listener = (bump: NotifBump) => void;

// A single Redis subscriber per process, fanned out in memory to the local SSE
// connections: N clients do not open N Redis connections.
let subscriber: IORedis | null = null;
const listeners = new Set<Listener>();

function ensureSubscriber(): boolean {
  const url = redisUrl();
  if (!url) return false;
  if (subscriber) return true;

  subscriber = new IORedis(url, { maxRetriesPerRequest: null });
  subscriber.on("error", (e) => logThrottled("[realtime] subscriber", e.message));
  // After a reconnection the subscription must be re-established: otherwise the
  // bus stays silent and only the fallback poll would surface notifications.
  subscriber.on("ready", () => {
    subscriber?.subscribe(NOTIF_CHANNEL).catch(() => {});
  });
  subscriber.on("message", (channel, raw) => {
    if (channel !== NOTIF_CHANNEL) return;
    let bump: NotifBump;
    try {
      bump = JSON.parse(raw) as NotifBump;
    } catch {
      return;
    }
    for (const fn of listeners) {
      try {
        fn(bump);
      } catch {
        /* a failing subscriber must not deprive the others of the signal */
      }
    }
  });
  // The initial subscription is set by the `ready` handler above, which covers
  // both the first connection and every reconnection.
  return true;
}

/**
 * Subscribes an SSE connection to the signals for `userId` or `role`.
 * Returns the unsubscribe function, or `null` when Redis is unavailable — the
 * caller then falls back to fast polling.
 */
export function onNotifFor(userId: string, role: string, fn: () => void): (() => void) | null {
  if (!ensureSubscriber()) return null;

  const listener: Listener = (bump) => {
    const forMe = bump.userIds?.includes(userId) || bump.roles?.includes(role);
    if (forMe) fn();
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}
