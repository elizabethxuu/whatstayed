import { link, linkInput, unlink } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

/** Tie a memory or a page to a person, or a page to a memory. */
export const POST = withUser(async (req, user) => {
  await link(user.id, await body(req, linkInput.parse));
  return json({ ok: true }, 201);
});
export const DELETE = withUser(async (req, user) => {
  await unlink(user.id, await body(req, linkInput.omit({ note: true }).parse));
  return json({ ok: true });
});
