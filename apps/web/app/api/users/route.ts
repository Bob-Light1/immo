import { NextRequest } from "next/server";
import { createUserSchema, paginationSchema, ROLES, type Role } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createUser, listUsers } from "@/lib/services/user.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    requireRole(req, "admin");
    const { searchParams } = new URL(req.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    const role = searchParams.get("role");
    const active = searchParams.get("active");
    const q = searchParams.get("q");
    const result = await listUsers(
      {
        role: ROLES.includes(role as Role) ? (role as Role) : undefined,
        active: active === null ? undefined : active === "1" || active === "true",
        q: q ?? undefined,
      },
      pagination,
    );
    return json(result);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = requireRole(req, "admin");
    const input = createUserSchema.parse(await req.json());
    const result = await createUser(input);
    await audit(req, admin.sub, "user.create", "user", result.user.id, { role: input.role });
    return json(result, { status: 201 });
  });
}
