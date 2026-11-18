import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db } from './db';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE = 'ws_session';
const DAYS = 30;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, PARAMS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, s, k] = stored.split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const want = Buffer.from(k, 'base64');
  const got = await scrypt(pw, Buffer.from(s, 'base64'), want.length, PARAMS);
  return got.length === want.length && timingSafeEqual(got, want);
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export async function startSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const q = await db();
  await q('delete from sessions where user_id = $1 and expires_at < now()', [userId]); // tidy old ones
  await q(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${DAYS} days')`, [sha(token), userId]);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const q = await db();
    await q('delete from sessions where token_hash = $1', [sha(token)]);
  }
  jar.delete(COOKIE);
}

export type User = { id: string; email: string };

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const q = await db();
  const rows = await q<{ id: string; email: string }>(
    `select u.id, u.email from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha(token)],
  );
  return rows[0] ?? null;
}
