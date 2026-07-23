import { NextRequest } from "next/server";
import { voteSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { vote } from "@/lib/services/sondage.service";

/** Vote (un par utilisateur, modifiable) — tout utilisateur authentifié (§5.13). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    const user = requireAuth(req);
    const { choix } = voteSchema.parse(await req.json());
    return json(await vote(params.id, user.sub, choix));
  });
}
