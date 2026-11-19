import { z } from 'zod';
import { setEntryMeta } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

/** Favourite a page, or keep it as a draft. */
export const PATCH = withUser<P>(async (req, user, { id }) => {
  await setEntryMeta(user.id, id, await body(req, z.object({ favorite: z.boolean().optional(), draft: z.boolean().optional() }).parse));
  return json({ ok: true });
});
