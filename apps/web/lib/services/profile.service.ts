import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/api";
import type { UpdateProfileInput } from "@campusgest/shared";

/**
 * User profile & preferences (design §8.3, §5.6). Covers the birthday opt-in
 * (birthday + birthday_public) and the notification channel preferences
 * (notif_prefs).
 */

const SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  email: true,
  phone: true,
  language: true,
  birthday: true,
  birthdayPublic: true,
  birthdayYearHidden: true,
  notifPrefs: true,
  totpSecret: true,
} as const;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!user) throw new ServiceError(404, "Utilisateur introuvable.");
  // Only the enabled flag is exposed, never the secret.
  const { totpSecret, ...rest } = user;
  return { ...rest, twoFactorEnabled: !!totpSecret };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.language !== undefined) data.language = input.language;
  if (input.birthday !== undefined) data.birthday = input.birthday;
  if (input.birthdayPublic !== undefined) data.birthdayPublic = input.birthdayPublic;
  if (input.birthdayYearHidden !== undefined) data.birthdayYearHidden = input.birthdayYearHidden;
  if (input.notifPrefs !== undefined) data.notifPrefs = input.notifPrefs;

  await prisma.user.update({ where: { id: userId }, data });
  return getProfile(userId);
}
