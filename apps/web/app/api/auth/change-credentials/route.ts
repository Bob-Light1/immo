import { NextRequest } from "next/server";
import { changeCredentialsSchema } from "@campusgest/shared";
import { handle, json } from "@/lib/api";
import { requireAuth } from "@/lib/rbac";
import { changeCredentials } from "@/lib/services/user.service";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const auth = requireAuth(req);
    const input = changeCredentialsSchema.parse(await req.json());
    const result = await changeCredentials(auth.sub, input);

    await audit(req, auth.sub, "auth.change_credentials", "user", auth.sub);

    // tokenVersion was just incremented: reissue the tokens so the current
    // session is not invalidated (revocation §4 through `ver`).
    const accessToken = signAccessToken({
      sub: auth.sub,
      role: result.role,
      ver: result.tokenVersion,
    });
    const refreshToken = signRefreshToken({ sub: auth.sub, ver: result.tokenVersion });

    const res = json({ username: result.username, role: result.role, accessToken });
    res.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return res;
  });
}
