import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { clearSubscription } from "@/lib/push";

/**
 * Désabonne l'appareil courant. Le client transmet son `endpoint` : sans lui on
 * purgerait tous les appareils de l'utilisateur, y compris ceux qui n'ont rien
 * demandé.
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
