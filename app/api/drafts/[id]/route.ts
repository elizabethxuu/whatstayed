import { deleteHandDraft, saveHandDraft } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

export const PUT = withUser<P>(async (req, user, { id }) => json({ id: await saveHandDraft(user.id, id, await body(req, (v) => v)) }));

export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteHandDraft(user.id, id);
  return json({ ok: true });
});
