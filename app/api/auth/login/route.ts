import { z } from 'zod';
import { db } from '@/lib/server/db';
import { startSession, verifyPassword } from '@/lib/server/auth';
import { creds } from '@/lib/server/creds';
import { body, HttpError, json, open } from '@/lib/server/http';
import { allow } from '@/lib/server/talk';

// Failed sign-ins per email and per network address, every 15 minutes.
const PER_EMAIL = 8;
const PER_IP = 30;
const WINDOW = 900;
const SLOW = 'Too many attempts. Please wait a few minutes and try again.';

const WRONG = 'That email and password don’t match.';

export const POST = open(async (req) => {
  const { email, password } = await body(req, (v) => {
    const r = creds.extend({ password: z.string().min(1).max(200) }).safeParse(v);
    if (!r.success) throw new HttpError(401, WRONG);
    return r.data;
  });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (!(await allow(`login:e:${email}`, PER_EMAIL, WINDOW, false)) || !(await allow(`login:ip:${ip}`, PER_IP, WINDOW, false))) {
    throw new HttpError(429, SLOW);
  }
  const q = await db();
  const rows = await q<{ id: string; pass_hash: string }>('select id, pass_hash from users where email = $1', [email]);
  // Hash even when the account doesn't exist, so timing doesn't reveal which emails have gardens.
  const ok = await verifyPassword(password, rows[0]?.pass_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!rows.length || !ok) {
    await allow(`login:e:${email}`, PER_EMAIL, WINDOW);
    await allow(`login:ip:${ip}`, PER_IP, WINDOW);
    throw new HttpError(401, WRONG);
  }
  await startSession(rows[0].id);
  return json({ user: { id: rows[0].id, email } });
});
