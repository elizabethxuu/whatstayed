import { collectionInput, deleteCollection, updateCollection } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };
export const PATCH = withUser<P>(async (req, user, { id }) => json({ collection: await updateCollection(user.id, id, await body(req, collectionInput.parse)) }));
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteCollection(user.id, id);
  return json({ ok: true });
});
