import IORedis from "ioredis";

/**
 * Publication des signaux temps réel depuis les jobs. Pendant du publisher de
 * apps/web/lib/realtime.ts, autonome au paquet workers (même logique que
 * push.ts). Les jobs tournent dans un autre process que l'app : sans ce signal,
 * une alerte d'échéance n'apparaîtrait chez le résident connecté qu'au prochain
 * sondage de secours.
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
    // ioredis retente indéfiniment : on étrangle le log pour ne pas noyer la
    // sortie des jobs pendant une coupure Redis.
    publisher.on("error", (e) => {
      const now = Date.now();
      if (now - lastErrorLog < 60_000) return;
      lastErrorLog = now;
      console.error("[realtime] publisher", e.message);
    });
  }
  return publisher;
}

/** Best-effort : une panne du bus ne fait jamais échouer un job. */
export function publishNotif(bump: NotifBump): void {
  const client = getPublisher();
  if (!client) return;
  client.publish(NOTIF_CHANNEL, JSON.stringify(bump)).catch(() => {});
}
