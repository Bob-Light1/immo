import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/api";
import { verifyRefreshToken, REFRESH_COOKIE } from "@/lib/auth";
import { onNotifFor, SAFETY_POLL_MS, FALLBACK_POLL_MS } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Flux temps réel des notifications (SSE, conception §8.3). EventSource ne peut
 * pas porter d'en-tête Authorization : on s'authentifie via le cookie refresh
 * (HttpOnly, envoyé automatiquement en same-origin).
 *
 * La relecture de la base est déclenchée par un signal Redis publié à chaque
 * écriture de notification — y compris depuis les jobs workers, dans un autre
 * process. Le sondage ne subsiste qu'en filet de sécurité (30 s), contre 8 s
 * par client auparavant. Sans Redis configuré, on retombe sur le sondage seul.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!cookie) return new Response("unauthorized", { status: 401 });

  let userId: string;
  let role: string;
  try {
    const payload = verifyRefreshToken(cookie);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      return new Response("unauthorized", { status: 401 });
    }
    userId = user.id;
    role = user.role;
  } catch {
    return new Response("unauthorized", { status: 401 });
  }

  const where = { OR: [{ targetUserId: userId }, { targetRole: role }] };
  const enc = new TextEncoder();
  let lastTs = new Date();
  let timer: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const tick = async () => {
        try {
          const fresh = await prisma.notification.findMany({
            where: { ...where, createdAt: { gt: lastTs } },
            orderBy: { createdAt: "asc" },
          });
          if (fresh.length > 0) {
            lastTs = fresh[fresh.length - 1]!.createdAt;
            for (const n of fresh) send("notification", serialize(n));
          }
          const unread = await prisma.notification.count({ where: { ...where, isRead: false } });
          send("unread", { unread });
        } catch {
          /* erreur transitoire : on réessaiera au prochain tick */
        }
      };

      const close = () => {
        if (timer) clearInterval(timer);
        if (beat) clearInterval(beat);
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };

      send("ready", { ok: true });
      void tick();

      // Relais Redis : la relecture est déclenchée à l'écriture, pas au rythme
      // d'une horloge. Le sondage passe alors en simple filet de sécurité.
      unsubscribe = onNotifFor(userId, role, () => void tick());
      timer = setInterval(() => void tick(), unsubscribe ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
      // Un client parti brutalement (écran verrouillé, PWA fermée) ne déclenche
      // pas toujours `abort`/`cancel` : l'enqueue lèverait alors en boucle dans
      // le setInterval, hors de toute portée try/catch. On ferme proprement.
      beat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": hb\n\n"));
        } catch {
          close();
        }
      }, HEARTBEAT_MS);
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (beat) clearInterval(beat);
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
