import { NextRequest } from "next/server";
import { updateProfileSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth, AuthError } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getProfile, updateProfile } from "@/lib/services/profile.service";

// Authenticated response: never statically rendered (one variant served to all).
export const dynamic = "force-dynamic";

// The owner (or an admin) reads their profile and preferences (§8.3).
function authorize(req: NextRequest, id: string) {
  const user = requireAuth(req);
  if (user.sub !== id && user.role !== "admin") {
    throw new AuthError(403, "Accès refusé à ce profil.", "auth.profilRefuse");
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
    const user = authorize(req, params.id);
    const input = updateProfileSchema.parse(await req.json());
    const result = await updateProfile(params.id, input);
    // Only an admin editing someone else's account is logged. A resident
    // changing their own preferences is not a sensitive action, and the
    // language switcher writes on every toggle — auditing that would bury the
    // trail under noise.
    if (user.sub !== params.id) {
      await audit(req, user.sub, "user.profile.update", "user", params.id, {
        fields: Object.keys(input),
      });
    }
    return json(result);
  });
}
