import { deleteEntry, entryInput, saveEntry } from '@/lib/server/data';
import { body, HttpError, json, withUser } from '@/lib/server/http';

type P = { id: string };

/** Save a page. A blank page is not kept. */
export const PUT = withUser<P>(async (req, user, { id }) => {
  const e = await body(req, (v) => entryInput.parse({ ...(v as object), id }));
  return json({ entry: await saveEntry(user.id, e) });
});

/** sendBeacon can only POST; treat it as a save. */
export const POST = PUT;

export const DELETE = withUser<P>(async (_req, user, { id }) => {
  if (!id) throw new HttpError(400, 'Which page?');
  await deleteEntry(user.id, id);
  return json({ ok: true });
});
