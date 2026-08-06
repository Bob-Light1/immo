import IORedis from "ioredis";

/**
 * Publishes real-time signals from the jobs. Counterpart of the publisher in
 * apps/web/lib/realtime.ts, self-contained in the workers package (same shape
 * as push.ts). Jobs run in a different process than the app: without this
 * signal, a due-date alert would only reach a connected resident on the next
 * fallback poll.
 */

const NOTIF_CHANNEL = "cg:notif";

export interface NotifBump {
  userIds?: string[];
  roles?: string[];
}

let publisher: IORedis | null = null;
let lastErrorLog = 0;

function getPublisher(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!publisher) {
    publisher = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    // ioredis retries forever: throttle the log so a Redis outage does not
    // drown the job output.
    publisher.on("error", (e) => {
      const now = Date.now();
      if (now - lastErrorLog < 60_000) return;
      lastErrorLog = now;
      console.error("[realtime] publisher", e.message);
    });
  }
  return publisher;
}

/** Best-effort: a bus outage must never fail a job. */
export function publishNotif(bump: NotifBump): void {
  const client = getPublisher();
  if (!client) return;
  client.publish(NOTIF_CHANNEL, JSON.stringify(bump)).catch(() => {});
}
