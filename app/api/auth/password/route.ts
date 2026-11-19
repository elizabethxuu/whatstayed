import { z } from 'zod';
import { db } from '@/lib/server/db';
import { hashPassword, startSession, verifyPassword } from '@/lib/server/auth';
import { body, HttpError, json, withUser } from '@/lib/server/http';

/** Change password: the current one is required; every other session is signed out. */
export const PUT = withUser(async (req, user) => {
  const { current, next } = await body(req, (v) => {
    const r = z.object({ current: z.string().min(1).max(200), next: z.string().min(8).max(200) }).safeParse(v);
    if (!r.success) throw new HttpError(400, 'Choose a new password of at least 8 characters.');
    return r.data;
  });
  const q = await db();
  const rows = await q<{ pass_hash: string }>('select pass_hash from users where id=$1', [user.id]);
  if (!rows.length || !(await verifyPassword(current, rows[0].pass_hash))) throw new HttpError(401, 'Your current password isn’t right.');
  await q('update users set pass_hash=$2 where id=$1', [user.id, await hashPassword(next)]);
  await q('delete from sessions where user_id=$1', [user.id]);
  await startSession(user.id);
  return json({ ok: true });
});
