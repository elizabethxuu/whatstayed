import { deleteMemory, listMemories, memoryInput, updateMemory } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

export const PATCH = withUser<P>(async (req, user, { id }) => {
  const m = await body(req, memoryInput.parse);
  await updateMemory(user.id, id, m);
  const all = await listMemories(user.id);
  return json({ memory: all.find((x) => x.id === id) });
});

export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteMemory(user.id, id);
  return json({ ok: true });
});
