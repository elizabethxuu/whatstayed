import { db } from '@/lib/server/db';
import { startSession, verifyPassword } from '@/lib/server/auth';
import { creds } from '@/lib/server/creds';
import { body, HttpError, json, open } from '@/lib/server/http';

const WRONG = 'That email and password don’t match.';

export const POST = open(async (req) => {
  const { email, password } = await body(req, (v) => {
    const r = creds.extend({ password: creds.shape.password.min(1) }).safeParse(v);
    if (!r.success) throw new HttpError(401, WRONG);
    return r.data;
  });
  const q = await db();
  const rows = await q<{ id: string; pass_hash: string }>('select id, pass_hash from users where email = $1', [email]);
  // Hash even when the account doesn't exist, so timing doesn't reveal which emails have gardens.
  const ok = await verifyPassword(password, rows[0]?.pass_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!rows.length || !ok) throw new HttpError(401, WRONG);
  await startSession(rows[0].id);
  return json({ user: { id: rows[0].id, email } });
});
