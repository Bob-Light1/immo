import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { clearSubscription } from "@/lib/push";

/**
 * Unsubscribes the current device. The client sends its `endpoint`: without it
 * every device of the user would be purged, including those that asked for
 * nothing.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : undefined;
    await clearSubscription(user.sub, endpoint);
    return json({ ok: true });
  });
}
