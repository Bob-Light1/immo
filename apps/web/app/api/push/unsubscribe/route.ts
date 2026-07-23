import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { clearSubscription } from "@/lib/push";

/** Supprime l'abonnement Web Push de l'utilisateur courant. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    await clearSubscription(user.sub);
    return json({ ok: true });
  });
}
