import { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { getPortfolio } from "@/lib/services/portfolio.service";

/** Consulte le portfolio d'un résident — tout utilisateur authentifié (§5.7). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    requireAuth(req);
    return json(await getPortfolio(params.id));
  });
}
