import { NextRequest } from "next/server";
import { portfolioSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { getPortfolio, upsertPortfolio } from "@/lib/services/portfolio.service";

/** Mon portfolio. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    return json(await getPortfolio(user.sub));
  });
}

/** Crée / met à jour mon portfolio (§5.7). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const input = portfolioSchema.parse(await req.json());
    return json(await upsertPortfolio(user.sub, input));
  });
}
