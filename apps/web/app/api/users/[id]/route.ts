import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deactivateUser } from "@/lib/services/user.service";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const result = await deactivateUser(params.id);
    await audit(req, admin.sub, "user.deactivate", "user", params.id);
    return json(result);
  });
}
