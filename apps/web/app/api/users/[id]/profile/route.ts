import { NextRequest } from "next/server";
import { updateProfileSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, AuthError } from "@/lib/rbac";
import { getProfile, updateProfile } from "@/lib/services/profile.service";

// Le propriétaire (ou un admin) accède à son profil et à ses préférences (§8.3).
function authorize(req: NextRequest, id: string) {
  const user = requireAuth(req);
  if (user.sub !== id && user.role !== "admin") {
    throw new AuthError(403, "Accès refusé à ce profil.");
  }
  return user;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    authorize(req, params.id);
    return json(await getProfile(params.id));
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handle(async () => {
    authorize(req, params.id);
    const input = updateProfileSchema.parse(await req.json());
    return json(await updateProfile(params.id, input));
  });
}
