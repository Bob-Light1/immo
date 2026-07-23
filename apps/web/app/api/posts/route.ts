import { NextRequest } from "next/server";
import { postSchema, paginationSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createPost, listPosts } from "@/lib/services/post.service";

/** Fil d'infos — tout utilisateur authentifié lit (posts masqués réservés Admin). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const { page, limit } = paginationSchema.parse({
      page: sp.get("page") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return json(await listPosts({ page, limit }, { includeHidden: user.role === "admin" }));
  });
}

/** Publie un post (image obligatoire) — Admin ou Bailleur (§5.9). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = requireRole(req, "admin", "bailleur");
    const input = postSchema.parse(await req.json());
    const post = await createPost(user.sub, input);
    await audit(req, user.sub, "post.create", "post_info", post.id);
    return json(post, { status: 201 });
  });
}
