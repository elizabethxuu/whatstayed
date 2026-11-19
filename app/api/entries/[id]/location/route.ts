import { locInput, setEntryLocation } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };
export const PUT = withUser<P>(async (req, user, { id }) => {
  await setEntryLocation(user.id, id, await body(req, locInput.parse));
  return json({ ok: true });
});
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await setEntryLocation(user.id, id, null);
  return json({ ok: true });
});
