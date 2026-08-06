import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { vapidPublicKey, pushEnabled } from "@/lib/push";

// Réponse authentifiée : jamais de rendu statique (une seule variante servie à tous).
export const dynamic = "force-dynamic";

/** Clé publique VAPID pour l'abonnement côté navigateur. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    return json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
  });
}
