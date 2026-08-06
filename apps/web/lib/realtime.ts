import IORedis from "ioredis";

/**
 * Relais temps réel des notifications (conception §8.3).
 *
 * Le flux SSE interrogeait la base toutes les 8 s, par client connecté : 200
 * résidents connectés = 50 requêtes/s en permanence, même quand rien ne se
 * passe. Redis sert désormais de bus : une notification créée — par l'app ou
 * par un job worker, dans un autre process — publie un signal, et seules les
 * connexions concernées vont relire la base.
 *
 * Le signal ne transporte que des destinataires, jamais le contenu : la base
 * reste la source de vérité et un message perdu ne peut pas produire une
 * notification fantôme. Un sondage lent (SAFETY_POLL_MS) reste en filet.
 */

export interface NotifBump {
  userIds?: string[];
  roles?: string[];
}

export const NOTIF_CHANNEL = "cg:notif";

/** Intervalle de sondage de secours quand le relais Redis est actif. */
export const SAFETY_POLL_MS = 30_000;
/** Intervalle quand Redis est indisponible : on retombe sur le sondage seul. */
export const FALLBACK_POLL_MS = 8_000;

function redisUrl(): string | null {
  return process.env.REDIS_URL ?? null;
}

// ─────────────────────────────── Publication ───────────────────────────────

let publisher: IORedis | null = null;
let lastErrorLog = 0;

// ioredis retente la connexion indéfiniment : sans étranglement, une coupure
// Redis noierait les logs. On journalise au plus une fois par minute, sans
// jamais désactiver le publisher (la reconnexion doit rester possible).
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
      // Ne bloque jamais une réponse API en attendant une reconnexion : sans
      // cela, publish() resterait en file d'attente pendant la coupure.
      enableOfflineQueue: false,
    });
    publisher.on("error", (e) => logThrottled("[realtime] publisher", e.message));
  }
  return publisher;
}

/**
 * Signale que de nouvelles notifications existent pour ces destinataires.
 * Best-effort : une panne Redis dégrade vers le sondage, elle ne fait jamais
 * échouer l'action métier qui vient d'écrire la notification.
 */
export function publishNotif(bump: NotifBump): void {
  const client = getPublisher();
  if (!client) return;
  client.publish(NOTIF_CHANNEL, JSON.stringify(bump)).catch(() => {});
}

// ─────────────────────────────── Abonnement ────────────────────────────────

type Listener = (bump: NotifBump) => void;

// Un seul abonné Redis par process, avec diffusion en mémoire vers les
// connexions SSE locales : N clients ne créent pas N connexions Redis.
let subscriber: IORedis | null = null;
const listeners = new Set<Listener>();

function ensureSubscriber(): boolean {
  const url = redisUrl();
  if (!url) return false;
  if (subscriber) return true;

  subscriber = new IORedis(url, { maxRetriesPerRequest: null });
  subscriber.on("error", (e) => logThrottled("[realtime] subscriber", e.message));
  // Après une reconnexion, l'abonnement doit être reposé : sinon le bus reste
  // muet et seul le sondage de secours ferait encore remonter les notifications.
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
        /* un abonné défaillant ne doit pas priver les autres du signal */
      }
    }
  });
  // L'abonnement initial est posé par le handler `ready` ci-dessus, qui couvre
  // aussi bien la première connexion que chaque reconnexion.
  return true;
}

/**
 * Abonne une connexion SSE aux signaux concernant `userId` ou `role`.
 * Renvoie la fonction de désabonnement, ou `null` si Redis n'est pas
 * disponible — l'appelant retombe alors sur le sondage rapide.
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
