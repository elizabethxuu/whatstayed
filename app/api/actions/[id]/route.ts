import { z } from 'zod';
import { decideAction } from '@/lib/server/agent';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

/** The person confirms or declines something the agent proposed. Only a confirmation changes anything. */
export const POST = withUser<P>(async (req, user, { id }) => {
  const { decision } = await body(req, (v) => z.object({ decision: z.enum(['confirm', 'decline']) }).parse(v));
  return json({ action: await decideAction(user.id, id, decision) });
});
