import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { markAllRead } from "@/lib/services/notification.service";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await markAllRead(user.sub, user.role));
  });
}
