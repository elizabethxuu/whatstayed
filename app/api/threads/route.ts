import { threadInput, tie } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => {
  const t = await body(req, threadInput.parse);
  return json({ id: await tie(user.id, t) }, 201);
});
