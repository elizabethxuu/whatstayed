import { z } from 'zod';
import { untie, updateThread } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

export const PATCH = withUser<P>(async (req, user, { id }) => {
  const { note } = await body(req, z.object({ note: z.string().trim().max(80).optional() }).parse);
  await updateThread(user.id, id, note);
  return json({ ok: true });
});

export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await untie(user.id, id);
  return json({ ok: true });
});
