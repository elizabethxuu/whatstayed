import { z } from 'zod';
import { db, ms } from './db';
import { HttpError } from './http';
import { memorySchema } from '../memory';
import { lifeState, ownPerson } from './life';

/* ---------- shapes ---------- */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2019-07-14.')
  .refine((v) => !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && +v.slice(0, 4) >= 1000 && +v.slice(0, 4) <= 9999, 'That date isn’t real.');

export const memoryInput = memorySchema.extend({
  place: z.string().trim().min(1).max(80),
  moment: z.string().trim().min(2).max(600),
  feeling: z.string().trim().min(1).max(40),
  when: z.string().trim().max(60).optional().nullable(),
  date: isoDate.optional().nullable(),
});

export const locInput = z.object({
  name: z.string().trim().min(1).max(120),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  source: z.enum(['manual', 'search', 'device']),
  updatedAt: z.number().optional(),
});

export const entryInput = z.object({
  id: z.string().min(4).max(64).regex(/^[\w-]+$/),
  body: z.string().max(100_000),
  createdAt: z.number().optional(),
});

export const threadInput = z.object({
  a: z.string().min(1).max(80),
  b: z.string().min(1).max(80),
  note: z.string().trim().max(80).optional(),
  origin: z.enum(['you', 'suggested']),
});

const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ---------- memories ---------- */

const MEM_COLS = `id, place, when_text as "when", to_char(happened_on, 'YYYY-MM-DD') as "date", moment, feeling, weight, echoes, because, origin,
  ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt"`;

export async function listMemories(user: string) {
  const q = await db();
  const rows = await q(`select ${MEM_COLS} from memories where user_id = $1 order by created_at, id`, [user]);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)));
}

export async function plantMemory(user: string, memId: string, m: z.infer<typeof memoryInput> | Omit<z.infer<typeof memoryInput>, 'date'>, origin: 'agent' | 'you') {
  const q = await db();
  await q(
    `insert into memories (user_id, id, place, when_text, moment, feeling, weight, echoes, because, origin, happened_on)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (user_id, id) do nothing`,
    [user, memId, m.place, m.when || null, m.moment, m.feeling, m.weight, m.echoes || null, m.because || null, origin, ('date' in m && m.date) || null],
  );
  return memId;
}

export async function createMemory(user: string, m: z.infer<typeof memoryInput>) {
  return plantMemory(user, `m${id()}`, m, 'you');
}

export async function updateMemory(user: string, memId: string, m: z.infer<typeof memoryInput>) {
  const q = await db();
  const rows = await q(
    `update memories set place=$3, when_text=$4, moment=$5, feeling=$6, weight=$7, happened_on=$8, updated_at=now()
     where user_id=$1 and id=$2 returning id`,
    [user, memId, m.place, m.when || null, m.moment, m.feeling, m.weight, m.date || null],
  );
  if (!rows.length) throw new HttpError(404, 'That memory isn’t here any more.');
}

export async function deleteMemory(user: string, memId: string) {
  const q = await db();
  const rows = await q('delete from memories where user_id=$1 and id=$2 returning id', [user, memId]);
  if (!rows.length) throw new HttpError(404, 'That memory isn’t here any more.');
  await q('delete from threads where user_id=$1 and (a=$2 or b=$2)', [user, memId]);
  await q(`delete from media where user_id=$1 and owner_type='memory' and owner_id=$2`, [user, memId]);
  await q(`delete from links where user_id=$1 and ((kind='memory-person' and a=$2) or (kind='entry-memory' and b=$2))`, [user, memId]);
  await q(`delete from collection_items where user_id=$1 and kind='memory' and item_id=$2`, [user, memId]);
}

export async function ownMemory(user: string, memId: string) {
  const q = await db();
  const r = await q('select 1 from memories where user_id=$1 and id=$2', [user, memId]);
  if (!r.length) throw new HttpError(404, 'That memory isn’t here any more.');
}

/* ---------- places & threads ---------- */

export async function setLocation(user: string, memId: string, loc: z.infer<typeof locInput>) {
  await ownMemory(user, memId);
  const q = await db();
  await q(
    `insert into locations (user_id, memory_id, data) values ($1,$2,$3::jsonb)
     on conflict (user_id, memory_id) do update set data = excluded.data, updated_at = now()`,
    [user, memId, JSON.stringify({ ...loc, updatedAt: Date.now() })],
  );
}

export async function removeLocation(user: string, memId: string) {
  const q = await db();
  await q('delete from locations where user_id=$1 and memory_id=$2', [user, memId]);
}

export async function tie(user: string, t: z.infer<typeof threadInput>) {
  if (t.a === t.b) throw new HttpError(400, 'A memory can’t be tied to itself.');
  await ownMemory(user, t.a);
  await ownMemory(user, t.b);
  const q = await db();
  const dup = await q('select id from threads where user_id=$1 and ((a=$2 and b=$3) or (a=$3 and b=$2))', [user, t.a, t.b]);
  if (dup.length) return dup[0].id as string;
  const tid = `t${id()}`;
  await q('insert into threads (user_id, id, a, b, note, origin) values ($1,$2,$3,$4,$5,$6)', [user, tid, t.a, t.b, t.note || null, t.origin]);
  return tid;
}

export async function updateThread(user: string, tid: string, note: string | undefined) {
  const q = await db();
  const r = await q('update threads set note=$3 where user_id=$1 and id=$2 returning id', [user, tid, note || null]);
  if (!r.length) throw new HttpError(404, 'That thread isn’t here any more.');
}

export async function untie(user: string, tid: string) {
  const q = await db();
  await q('delete from threads where user_id=$1 and id=$2', [user, tid]);
}

export async function dismiss(user: string, key: string) {
  const q = await db();
  await q('insert into dismissed (user_id, key) values ($1,$2) on conflict do nothing', [user, key.slice(0, 200)]);
}

/* ---------- archives ---------- */

export async function saveEntry(user: string, e: z.infer<typeof entryInput>) {
  const q = await db();
  if (!e.body.trim()) {
    await deleteEntry(user, e.id);
    return null;
  }
  const created = e.createdAt ? new Date(e.createdAt) : new Date();
  const rows = await q(
    `insert into entries (user_id, id, body, created_at, updated_at) values ($1,$2,$3,$4, now())
     on conflict (user_id, id) do update set
       body = excluded.body,
       created_at = excluded.created_at,
       updated_at = case when entries.body = excluded.body and entries.created_at = excluded.created_at then entries.updated_at else now() end
     returning id, body, ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt"`,
    [user, e.id, e.body, created],
  );
  return rows[0];
}

export async function deleteEntry(user: string, eid: string) {
  const q = await db();
  await q('delete from entries where user_id=$1 and id=$2', [user, eid]);
  await q(`delete from media where user_id=$1 and owner_type='entry' and owner_id=$2`, [user, eid]);
  await q(`delete from links where user_id=$1 and kind in ('entry-person','entry-memory') and a=$2`, [user, eid]);
  await q(`delete from collection_items where user_id=$1 and kind='entry' and item_id=$2`, [user, eid]);
}

export async function ownEntry(user: string, eid: string) {
  const q = await db();
  const r = await q('select 1 from entries where user_id=$1 and id=$2', [user, eid]);
  if (!r.length) throw new HttpError(404, 'Write something on this page first.');
}

/* ---------- media ---------- */

export const LIMITS = { photo: 4 * 1024 * 1024, voice: 4 * 1024 * 1024 };
const MIMES = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  voice: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'],
};

export async function addMedia(
  user: string,
  owner: { type: 'memory' | 'entry' | 'person'; id: string },
  kind: 'photo' | 'voice',
  file: { mime: string; bytes: Buffer; durationMs?: number },
) {
  const base = file.mime.split(';')[0].trim();
  if (!MIMES[kind].includes(base)) throw new HttpError(415, kind === 'photo' ? 'Photographs need to be JPEG, PNG or WebP.' : 'That recording format isn’t supported.');
  if (!file.bytes.length) throw new HttpError(400, 'That file is empty.');
  if (file.bytes.length > LIMITS[kind]) throw new HttpError(413, 'That file is too large (4 MB at most).');
  if (owner.type === 'memory') await ownMemory(user, owner.id);
  else if (owner.type === 'entry') await ownEntry(user, owner.id);
  else await ownPerson(user, owner.id);
  const q = await db();
  const rows = await q(
    `insert into media (user_id, owner_type, owner_id, kind, mime, size, duration_ms, bytes)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, ${ms('created_at')} as "createdAt"`,
    [user, owner.type, owner.id, kind, base, file.bytes.length, file.durationMs ?? null, file.bytes],
  );
  return { id: rows[0].id as string, ownerType: owner.type, ownerId: owner.id, kind, mime: base, size: file.bytes.length, durationMs: file.durationMs, createdAt: rows[0].createdAt };
}

export async function getMedia(user: string, mid: string) {
  if (!/^[0-9a-f-]{36}$/.test(mid)) throw new HttpError(404, 'Not found.');
  const q = await db();
  const rows = await q<{ mime: string; bytes: Buffer | Uint8Array }>('select mime, bytes from media where user_id=$1 and id=$2', [user, mid]);
  if (!rows.length) throw new HttpError(404, 'Not found.');
  return { mime: rows[0].mime, bytes: Buffer.from(rows[0].bytes) };
}

export async function deleteMedia(user: string, mid: string) {
  if (!/^[0-9a-f-]{36}$/.test(mid)) throw new HttpError(404, 'Not found.');
  const q = await db();
  await q('delete from media where user_id=$1 and id=$2', [user, mid]);
}

/* ---------- everything, at once ---------- */

export async function state(user: string, tz?: string) {
  const q = await db();
  const [memories, entries, locs, threads, dismissed, media] = await Promise.all([
    listMemories(user),
    q(`select id, body, location, ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt" from entries where user_id=$1 order by created_at desc`, [user]),
    q<{ memory_id: string; data: unknown }>('select memory_id, data from locations where user_id=$1', [user]),
    q(`select id, a, b, note, origin, ${ms('created_at')} as "createdAt" from threads where user_id=$1 order by created_at`, [user]),
    q<{ key: string }>('select key from dismissed where user_id=$1', [user]),
    q(`select id, owner_type as "ownerType", owner_id as "ownerId", kind, mime, size, duration_ms as "durationMs", ${ms('created_at')} as "createdAt"
       from media where user_id=$1 order by created_at`, [user]),
  ]);
  const life = await lifeState(user, tz);
  return {
    ...life,
    memories,
    entries: entries.map((e) => {
      const loc = typeof e.location === 'string' ? JSON.parse(e.location) : e.location;
      const { location: _l, ...rest } = e;
      void _l;
      return loc ? { ...rest, location: loc } : rest;
    }),
    locations: Object.fromEntries(locs.map((l) => [l.memory_id, typeof l.data === 'string' ? JSON.parse(l.data) : l.data])),
    threads: threads.map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== null))),
    dismissed: dismissed.map((d) => d.key),
    media: media.map((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null))),
  };
}

/* ---------- conversation ---------- */

export async function getConversation(user: string) {
  const q = await db();
  const r = await q<{ messages: unknown }>('select messages from conversations where user_id=$1', [user]);
  const m = r[0]?.messages;
  return Array.isArray(m) ? m : typeof m === 'string' ? JSON.parse(m) : [];
}

export async function saveConversation(user: string, messages: unknown[]) {
  const text = JSON.stringify(messages);
  if (text.length > 1_500_000) throw new HttpError(413, 'This conversation has grown too long to save.');
  const q = await db();
  await q(
    `insert into conversations (user_id, messages) values ($1,$2::jsonb)
     on conflict (user_id) do update set messages = excluded.messages, updated_at = now()`,
    [user, text],
  );
}

export async function clearGarden(user: string) {
  const q = await db();
  await q('delete from conversations where user_id=$1', [user]);
  await q(`delete from media where user_id=$1 and owner_type='memory'`, [user]);
  await q('delete from threads where user_id=$1', [user]);
  await q('delete from dismissed where user_id=$1', [user]);
  await q('delete from memories where user_id=$1', [user]);
  await q(`delete from links where user_id=$1 and (kind='memory-person' or kind='entry-memory')`, [user]);
  await q(`delete from collection_items where user_id=$1 and kind='memory'`, [user]);
}

export async function setEntryLocation(user: string, eid: string, loc: z.infer<typeof locInput> | null) {
  await ownEntry(user, eid);
  const q = await db();
  await q('update entries set location=$3::jsonb where user_id=$1 and id=$2', [user, eid, loc ? JSON.stringify({ ...loc, updatedAt: Date.now() }) : null]);
}
