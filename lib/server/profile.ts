import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import { HttpError } from './http';
import { profileSchema, type Profile } from '../profile';

export async function getProfile(user: string): Promise<Profile> {
  const q = await db();
  const r = await q<{ data: unknown }>('select data from profiles where user_id=$1', [user]);
  const d = r[0]?.data;
  return (typeof d === 'string' ? JSON.parse(d) : d) ?? {};
}

/** Merge what was sent into the profile; anything not sent stays as it was. */
export async function saveProfile(user: string, patch: Profile) {
  const clean = profileSchema.parse(patch);
  const q = await db();
  const cur = await getProfile(user);
  const next: Profile = {
    ...cur,
    ...clean,
    reminders: clean.reminders ? { ...cur.reminders, ...clean.reminders } : cur.reminders,
    reflection: clean.reflection ? { ...cur.reflection, ...clean.reflection } : cur.reflection,
  };
  await q(
    `insert into profiles (user_id, data) values ($1, $2::jsonb)
     on conflict (user_id) do update set data = excluded.data, updated_at = now()`,
    [user, JSON.stringify(next)],
  );
  return next;
}

/** "Delete my personal information": the profile is emptied; memories are untouched. */
export async function clearProfile(user: string) {
  const q = await db();
  const cur = await getProfile(user);
  if (cur.photoId) await q('delete from media where user_id=$1 and id=$2', [user, cur.photoId]);
  await q(`update profiles set data = jsonb_build_object('onboarded', true), updated_at = now() where user_id=$1`, [user]);
}

/* ---------- password reset ---------- */

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/** Email is the only part that needs an outside service. Without one, say so plainly. */
export function resetConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESET_FROM_EMAIL);
}

export async function createReset(email: string) {
  const q = await db();
  const u = await q<{ id: string }>('select id from users where email=$1', [email]);
  if (!u.length) return null;
  const token = randomBytes(32).toString('base64url');
  await q(`delete from resets where user_id=$1`, [u[0].id]);
  await q(`insert into resets (token_hash, user_id, expires_at) values ($1,$2, now() + interval '1 hour')`, [sha(token), u[0].id]);
  return token;
}

export async function sendResetEmail(email: string, link: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESET_FROM_EMAIL,
      to: email,
      subject: 'Reset your What Stayed password',
      text: `Someone asked to reset the password for your What Stayed garden.\n\nTo choose a new one, open this link within the hour:\n${link}\n\nIf it wasn't you, you can ignore this email; nothing changes.`,
    }),
  });
  if (!r.ok) throw new HttpError(502, 'The reset email couldn’t be sent. Please try again in a little while.');
}

export async function redeemReset(token: string) {
  const q = await db();
  const r = await q<{ user_id: string }>(
    `update resets set used = true where token_hash=$1 and not used and expires_at > now() returning user_id`,
    [sha(token)],
  );
  if (!r.length) throw new HttpError(400, 'That link has expired or was already used. Ask for a new one.');
  return r[0].user_id;
}
