import { NextRequest } from "next/server";
import { portfolioSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deletePortfolio, getPortfolio, upsertPortfolio } from "@/lib/services/portfolio.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

/** My portfolio. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await getPortfolio(user.sub));
  });
}

/** Creates / updates my portfolio (§5.7). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = portfolioSchema.parse(await req.json());
    return json(await upsertPortfolio(user.sub, input));
  });
}

/** Removes my portfolio from the directory (§5.7). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const result = await deletePortfolio(user.sub);
    await audit(req, user.sub, "portfolio.delete", "portfolio", user.sub);
    return json(result);
  });
}
