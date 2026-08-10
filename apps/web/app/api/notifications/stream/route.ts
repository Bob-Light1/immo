import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/api";
import { verifyRefreshToken, REFRESH_COOKIE } from "@/lib/auth";
import { onNotifFor, SAFETY_POLL_MS, FALLBACK_POLL_MS } from "@/lib/realtime";
import { localizeNotification } from "@/lib/services/notification.service";
import { LOCALES, type Locale } from "@campusgest/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Real-time notification stream (SSE, design §8.3). EventSource cannot carry an
 * Authorization header: authentication goes through the refresh cookie
 * (HttpOnly, sent automatically on same-origin requests).
 *
 * Re-reading the database is triggered by a Redis signal published on every
 * notification write — including from the worker jobs, in another process.
 * Polling survives only as a safety net (30 s), against 8 s per client before.
 * Without Redis configured, polling alone takes over.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!cookie) return new Response("unauthorized", { status: 401 });

  let userId: string;
  let role: string;
  let locale: string;
  try {
    const payload = verifyRefreshToken(cookie);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      return new Response("unauthorized", { status: 401 });
    }
    userId = user.id;
    role = user.role;
    // EventSource cannot set headers, so the interface locale travels in the
    // query string; the account preference takes over when it is absent.
    const asked = req.nextUrl.searchParams.get("locale");
    locale = LOCALES.includes(asked as Locale) ? asked! : user.language;
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
            for (const n of fresh) send("notification", serialize(localizeNotification(n, locale)));
          }
          const unread = await prisma.notification.count({ where: { ...where, isRead: false } });
          send("unread", { unread });
        } catch {
          /* transient error: retried on the next tick */
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
          /* already closed */
        }
      };

      send("ready", { ok: true });
      void tick();

      // Redis relay: re-reading is triggered by writes, not by a clock. Polling
      // then falls back to being a mere safety net.
      unsubscribe = onNotifFor(userId, role, () => void tick());
      timer = setInterval(() => void tick(), unsubscribe ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
      // A client that vanished abruptly (locked screen, PWA closed) does not
      // always fire `abort`/`cancel`: enqueue would then throw repeatedly inside
      // the setInterval, outside any try/catch. Close cleanly instead.
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
