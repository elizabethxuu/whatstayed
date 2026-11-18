import { z } from 'zod';
import { db } from '@/lib/server/db';
import { endSession, verifyPassword } from '@/lib/server/auth';
import { body, HttpError, json, withUser } from '@/lib/server/http';

/** Delete the account and everything in it, for good. Asks for the password again. */
export const DELETE = withUser(async (req, user) => {
  const { password } = await body(req, z.object({ password: z.string().min(1).max(200) }).parse);
  const q = await db();
  const rows = await q<{ pass_hash: string }>('select pass_hash from users where id=$1', [user.id]);
  if (!rows.length || !(await verifyPassword(password, rows[0].pass_hash))) throw new HttpError(401, 'That password isn’t right.');
  await endSession();
  await q('delete from users where id=$1', [user.id]); // cascades to every table
  return json({ ok: true });
});
