import { getConversation, state } from '@/lib/server/data';
import { json, withUser } from '@/lib/server/http';

/** Everything this person has kept, as plain JSON. Files are listed here and fetched one by one. */
export const GET = withUser(async (_req, user) => {
  const s = await state(user.id);
  return json({
    format: 'whatstayed-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { email: user.email },
    ...s,
    conversation: await getConversation(user.id),
  });
});
