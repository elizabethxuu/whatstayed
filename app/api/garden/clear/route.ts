import { clearGarden } from '@/lib/server/data';
import { json, withUser } from '@/lib/server/http';

/** Begin again: the tree, its places, threads and photographs go. The Archives stay. */
export const POST = withUser(async (_req, user) => {
  await clearGarden(user.id);
  return json({ ok: true });
});
