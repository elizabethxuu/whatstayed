import { z } from 'zod';
import { getConversation, saveConversation } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

export const GET = withUser(async (_req, user) => json({ messages: await getConversation(user.id) }));

export const PUT = withUser(async (req, user) => {
  const { messages } = await body(req, z.object({ messages: z.array(z.object({ id: z.string(), role: z.string(), parts: z.array(z.unknown()) }).passthrough()).max(400) }).parse);
  await saveConversation(user.id, messages);
  return json({ ok: true });
});
