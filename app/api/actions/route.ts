import { listActions } from '@/lib/server/agent';
import { json, withUser } from '@/lib/server/http';

/** Changes the agent has proposed, and what became of them. ?talk=<id> for one conversation. */
export const GET = withUser(async (req, user) => {
  const talk = new URL(req.url).searchParams.get('talk') ?? undefined;
  return json({ actions: await listActions(user.id, talk && /^[\w-]{1,80}$/.test(talk) ? talk : undefined) });
});
