import { db, ms } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';

/** What the agent has done with this person's archive: each tool it used, whether it worked, how long it took. */
export const GET = withUser(async (_req, user) => {
  const q = await db();
  const rows = await q(`select tool, ok, ms, error, talk_id as "talkId", ${ms('at')} as "at" from tool_log where user_id=$1 order by at desc limit 60`, [user.id]);
  return json({ log: rows });
});
