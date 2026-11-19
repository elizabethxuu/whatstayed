import { z } from 'zod';
import { db } from '@/lib/server/db';
import { hashPassword, startSession } from '@/lib/server/auth';
import { body, HttpError, json, open } from '@/lib/server/http';
import { redeemReset } from '@/lib/server/profile';

export const POST = open(async (req) => {
  const { token, password } = await body(req, (v) => {
    const r = z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) }).safeParse(v);
    if (!r.success) throw new HttpError(400, 'Choose a password of at least 8 characters.');
    return r.data;
  });
  const userId = await redeemReset(token);
  const q = await db();
  await q('update users set pass_hash=$2 where id=$1', [userId, await hashPassword(password)]);
  await q('delete from sessions where user_id=$1', [userId]);
  await startSession(userId);
  return json({ ok: true });
});
