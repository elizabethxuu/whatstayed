import { state } from '@/lib/server/data';
import { getTalk, listTalks } from '@/lib/server/talk';
import { json, withUser } from '@/lib/server/http';
import { tzOffset } from '@/lib/server/auth';

/** Everything this person has kept, as plain JSON. Files are listed here and fetched one by one. */
export const GET = withUser(async (_req, user) => {
  const s = await state(user.id, await tzOffset());
  return json({
    format: 'whatstayed-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { email: user.email },
    ...s,
    conversations: await Promise.all((await listTalks(user.id)).map(async (t) => {
      const { messages, drafts } = await getTalk(user.id, t.id);
      return { ...t, messages, drafts };
    })),
  });
});
