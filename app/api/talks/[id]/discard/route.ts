import { z } from 'zod';
import { discardDrafts } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

export const POST = withUser<P>(async (req, user, { id }) => {
  const { ids } = await body(req, z.object({ ids: z.array(z.string().max(80)).max(50).optional() }).parse);
  await discardDrafts(user.id, id, ids);
  return json({ ok: true });
});
