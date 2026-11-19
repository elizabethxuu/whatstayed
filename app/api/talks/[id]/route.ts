import { z } from 'zod';
import { deleteTalk, getTalk, saveTalk } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

export const GET = withUser<P>(async (_req, user, { id }) => json(await getTalk(user.id, id)));

export const PUT = withUser<P>(async (req, user, { id }) => {
  const { messages } = await body(
    req,
    z.object({ messages: z.array(z.object({ id: z.string(), role: z.string(), parts: z.array(z.unknown()) }).passthrough()).max(400) }).parse,
  );
  await saveTalk(user.id, id, messages);
  return json({ ok: true });
});

/** Deletes the conversation and its unsaved drafts. Memories already saved from it stay in the garden. */
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteTalk(user.id, id);
  return json({ ok: true });
});
