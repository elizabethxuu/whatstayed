import { z } from 'zod';
import { createTalk, listTalks } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

export const GET = withUser(async (_req, user) => json({ talks: await listTalks(user.id) }));

/** Start a new conversation: free, or about one trip. */
export const POST = withUser(async (req, user) => {
  const { mode } = await body(req, z.object({ mode: z.enum(['free', 'trip']).default('free') }).parse);
  return json({ talk: await createTalk(user.id, mode) }, 201);
});
