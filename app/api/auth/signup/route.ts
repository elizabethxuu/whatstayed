import { db } from '@/lib/server/db';
import { hashPassword, startSession } from '@/lib/server/auth';
import { creds } from '@/lib/server/creds';
import { body, HttpError, json, open } from '@/lib/server/http';

export const POST = open(async (req) => {
  const { email, password } = await body(req, (v) => {
    const r = creds.safeParse(v);
    if (r.success) return r.data;
    const pw = r.error.issues.find((i) => i.path[0] === 'password');
    throw new HttpError(400, pw ? 'Choose a password of at least 8 characters.' : 'Please enter a valid email.');
  });
  const q = await db();
  const taken = await q('select 1 from users where email = $1', [email]);
  if (taken.length) throw new HttpError(409, 'There is already a garden for that email. Try signing in.');
  const rows = await q<{ id: string }>('insert into users (email, pass_hash) values ($1, $2) returning id', [
    email,
    await hashPassword(password),
  ]);
  await startSession(rows[0].id);
  return json({ user: { id: rows[0].id, email } }, 201);
});
