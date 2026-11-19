import { addToCollection, itemInput, removeFromCollection } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };
export const POST = withUser<P>(async (req, user, { id }) => {
  await addToCollection(user.id, id, await body(req, itemInput.parse));
  return json({ ok: true }, 201);
});
export const DELETE = withUser<P>(async (req, user, { id }) => {
  await removeFromCollection(user.id, id, await body(req, itemInput.parse));
  return json({ ok: true });
});
