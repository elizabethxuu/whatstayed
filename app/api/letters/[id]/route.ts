import { deleteLetter, listLetters, openLetter } from '@/lib/server/life';
import { tzOffset } from '@/lib/server/auth';
import { json, withUser } from '@/lib/server/http';

type P = { id: string };
/** Open a letter (on its day, or early if the person chooses). */
export const POST = withUser<P>(async (_req, user, { id }) => {
  await openLetter(user.id, id);
  return json({ letters: await listLetters(user.id, await tzOffset()) });
});
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteLetter(user.id, id);
  return json({ ok: true });
});
