import { deletePerson, personInput, updatePerson } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };
export const PATCH = withUser<P>(async (req, user, { id }) => json({ person: await updatePerson(user.id, id, await body(req, personInput.parse)) }));
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deletePerson(user.id, id);
  return json({ ok: true });
});
