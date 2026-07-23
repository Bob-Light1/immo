import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { markRead } from "@/lib/services/notification.service";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await markRead(params.id, user.sub, user.role));
  });
}
