import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deletePortfolio, getPortfolio } from "@/lib/services/portfolio.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** Reads a resident's portfolio — any authenticated user (§5.7). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireAuth(req);
    return json(await getPortfolio(params.id));
  });
}

/** Removes a resident's portfolio from the directory — Admin (moderation, §5.7). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const result = await deletePortfolio(params.id);
    await audit(req, admin.sub, "portfolio.delete", "portfolio", params.id);
    return json(result);
  });
}
