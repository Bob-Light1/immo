import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deleteDocument } from "@/lib/services/document.service";

/** Supprime un document partagé — Admin (§5.15). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireRole(req, "admin");
    await deleteDocument(params.id);
    await audit(req, user.sub, "document.delete", "document", params.id);
    return json({ ok: true });
  });
}
