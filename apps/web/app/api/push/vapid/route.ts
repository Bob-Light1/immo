import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { vapidPublicKey, pushEnabled } from "@/lib/push";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** VAPID public key for the browser-side subscription. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    requireAuth(req);
    return json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });
  });
}
