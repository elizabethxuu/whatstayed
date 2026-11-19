import { clearProfile, getProfile, saveProfile } from '@/lib/server/profile';
import { profileSchema } from '@/lib/profile';
import { body, json, withUser } from '@/lib/server/http';

export const GET = withUser(async (_req, user) => json({ profile: await getProfile(user.id) }));

export const PUT = withUser(async (req, user) => json({ profile: await saveProfile(user.id, await body(req, profileSchema.parse)) }));

/** Delete personal information (name, birthday, home, intention, photo). Memories stay. */
export const DELETE = withUser(async (_req, user) => {
  await clearProfile(user.id);
  return json({ profile: await getProfile(user.id) });
});
