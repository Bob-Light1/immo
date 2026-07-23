import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { vapidPublicKey, pushEnabled } from "@/lib/push";

/** Clé publique VAPID pour l'abonnement côté navigateur. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    return json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
  });
}
