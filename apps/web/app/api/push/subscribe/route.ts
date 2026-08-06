import { NextRequest } from "next/server";
import { pushSubscriptionSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { saveSubscription } from "@/lib/push";

/** Stores the current user's Web Push subscription. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sub = pushSubscriptionSchema.parse(await req.json());
    await saveSubscription(user.sub, sub);
    return json({ ok: true }, { status: 201 });
  });
}
