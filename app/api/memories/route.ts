import { createMemory, listMemories, memoryInput } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

export const GET = withUser(async (_req, user) => json({ memories: await listMemories(user.id) }));

export const POST = withUser(async (req, user) => {
  const m = await body(req, memoryInput.parse);
  const id = await createMemory(user.id, m);
  const all = await listMemories(user.id);
  return json({ memory: all.find((x) => x.id === id) }, 201);
});
