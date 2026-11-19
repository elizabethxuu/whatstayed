import { letterInput, listLetters, writeLetter } from '@/lib/server/life';
import { tzOffset } from '@/lib/server/auth';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => {
  const tz = await tzOffset();
  await writeLetter(user.id, await body(req, letterInput.parse), tz);
  return json({ letters: await listLetters(user.id, tz) }, 201);
});
