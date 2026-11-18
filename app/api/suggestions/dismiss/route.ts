import { z } from 'zod';
import { dismiss } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => {
  const { key } = await body(req, z.object({ key: z.string().min(1).max(200) }).parse);
  await dismiss(user.id, key);
  return json({ ok: true });
});
