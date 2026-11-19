/** People, links, collections, letters and milestones: the rest of a life, kept per person. */
import { z } from 'zod';
import { db, ms } from './db';
import { HttpError } from './http';

const nid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2019-07-14.').refine((v) => !Number.isNaN(Date.parse(v + 'T00:00:00Z')), 'That date isn’t real.');
const opt = (n: number) => z.string().trim().max(n).optional().nullable();
const clean = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as T;

/* ---------- people ---------- */

export const personInput = z.object({
  name: z.string().trim().min(1, 'A name, even a nickname.').max(80),
  relation: opt(60),
  description: opt(600),
  notes: opt(20_000),
});

export async function ownPerson(user: string, pid: string) {
  const q = await db();
  if (!(await q('select 1 from people where user_id=$1 and id=$2', [user, pid])).length) throw new HttpError(404, 'That person isn’t here any more.');
}

const PERSON_COLS = `id, name, relation, description, notes, ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt"`;

export async function createPerson(user: string, p: z.infer<typeof personInput>) {
  const q = await db();
  const id = nid('p');
  const rows = await q(
    `insert into people (user_id, id, name, relation, description, notes) values ($1,$2,$3,$4,$5,$6) returning ${PERSON_COLS}`,
    [user, id, p.name, p.relation || null, p.description || null, p.notes || null],
  );
  return clean(rows[0]);
}

export async function updatePerson(user: string, pid: string, p: z.infer<typeof personInput>) {
  const q = await db();
  const rows = await q(
    `update people set name=$3, relation=$4, description=$5, notes=$6, updated_at=now() where user_id=$1 and id=$2 returning ${PERSON_COLS}`,
    [user, pid, p.name, p.relation || null, p.description || null, p.notes || null],
  );
  if (!rows.length) throw new HttpError(404, 'That person isn’t here any more.');
  return clean(rows[0]);
}

export async function deletePerson(user: string, pid: string) {
  const q = await db();
  const r = await q('delete from people where user_id=$1 and id=$2 returning id', [user, pid]);
  if (!r.length) throw new HttpError(404, 'That person isn’t here any more.');
  await q(`delete from links where user_id=$1 and kind in ('memory-person','entry-person') and b=$2`, [user, pid]);
  await q(`delete from media where user_id=$1 and owner_type='person' and owner_id=$2`, [user, pid]);
}

/* ---------- links: memory↔person, page↔person, page↔memory ---------- */

export const linkInput = z.object({
  kind: z.enum(['memory-person', 'entry-person', 'entry-memory']),
  a: z.string().min(1).max(80),
  b: z.string().min(1).max(80),
  note: z.string().trim().max(120).optional().nullable(),
});

async function owns(user: string, table: 'memories' | 'entries' | 'people', id: string) {
  const q = await db();
  if (!(await q(`select 1 from ${table} where user_id=$1 and id=$2`, [user, id])).length) {
    throw new HttpError(404, table === 'people' ? 'That person isn’t here any more.' : table === 'entries' ? 'Write something on this page first.' : 'That memory isn’t here any more.');
  }
}

export async function link(user: string, l: z.infer<typeof linkInput>) {
  const [ta, tb] = { 'memory-person': ['memories', 'people'], 'entry-person': ['entries', 'people'], 'entry-memory': ['entries', 'memories'] }[l.kind] as [
    'memories' | 'entries',
    'memories' | 'people',
  ];
  await owns(user, ta, l.a);
  await owns(user, tb, l.b);
  const q = await db();
  await q(
    `insert into links (user_id, kind, a, b, note) values ($1,$2,$3,$4,$5)
     on conflict (user_id, kind, a, b) do update set note = excluded.note`,
    [user, l.kind, l.a, l.b, l.note || null],
  );
}

export async function unlink(user: string, l: Omit<z.infer<typeof linkInput>, 'note'>) {
  const q = await db();
  await q('delete from links where user_id=$1 and kind=$2 and a=$3 and b=$4', [user, l.kind, l.a, l.b]);
}

/* ---------- collections ---------- */

export const collectionInput = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(80),
  description: opt(400),
  cover: z.string().regex(/^[0-9a-f-]{36}$/).optional().nullable(),
});

export async function ownCollection(user: string, cid: string) {
  const q = await db();
  if (!(await q('select 1 from collections where user_id=$1 and id=$2', [user, cid])).length) throw new HttpError(404, 'That collection isn’t here any more.');
}

const COL_COLS = `id, name, description, cover, ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt"`;

async function checkCover(user: string, cover?: string | null) {
  if (!cover) return;
  const q = await db();
  if (!(await q(`select 1 from media where user_id=$1 and id=$2 and kind='photo'`, [user, cover])).length) throw new HttpError(404, 'That photograph isn’t here any more.');
}

export async function createCollection(user: string, c: z.infer<typeof collectionInput>) {
  await checkCover(user, c.cover);
  const q = await db();
  const rows = await q(`insert into collections (user_id, id, name, description, cover) values ($1,$2,$3,$4,$5) returning ${COL_COLS}`, [
    user,
    nid('k'),
    c.name,
    c.description || null,
    c.cover || null,
  ]);
  return clean(rows[0]);
}

export async function updateCollection(user: string, cid: string, c: z.infer<typeof collectionInput>) {
  await checkCover(user, c.cover);
  const q = await db();
  const rows = await q(`update collections set name=$3, description=$4, cover=$5, updated_at=now() where user_id=$1 and id=$2 returning ${COL_COLS}`, [
    user,
    cid,
    c.name,
    c.description || null,
    c.cover || null,
  ]);
  if (!rows.length) throw new HttpError(404, 'That collection isn’t here any more.');
  return clean(rows[0]);
}

export async function deleteCollection(user: string, cid: string) {
  const q = await db();
  await q('delete from collections where user_id=$1 and id=$2', [user, cid]);
  await q('delete from collection_items where user_id=$1 and collection_id=$2', [user, cid]);
}

export const itemInput = z.object({ kind: z.enum(['memory', 'entry']), id: z.string().min(1).max(80) });

export async function addToCollection(user: string, cid: string, it: z.infer<typeof itemInput>) {
  await ownCollection(user, cid);
  await owns(user, it.kind === 'memory' ? 'memories' : 'entries', it.id);
  const q = await db();
  await q(
    `insert into collection_items (user_id, collection_id, kind, item_id, position)
     values ($1,$2,$3,$4, coalesce((select max(position)+1 from collection_items where user_id=$1 and collection_id=$2), 0))
     on conflict do nothing`,
    [user, cid, it.kind, it.id],
  );
  await q('update collections set updated_at=now() where user_id=$1 and id=$2', [user, cid]);
}

export async function removeFromCollection(user: string, cid: string, it: z.infer<typeof itemInput>) {
  const q = await db();
  await q('delete from collection_items where user_id=$1 and collection_id=$2 and kind=$3 and item_id=$4', [user, cid, it.kind, it.id]);
}

/* ---------- letters to a future self ---------- */

export const letterInput = z.object({
  body: z.string().trim().min(1, 'Write a little first.').max(50_000),
  openOn: isoDate,
});

/** A sealed letter's words never leave the server before its day. */
const LETTER_COLS = (today: string) => `id, to_char(open_on, 'YYYY-MM-DD') as "openOn", ${ms('created_at')} as "writtenAt",
  case when opened_at is not null then ${ms('opened_at')} end as "openedAt",
  case when open_on <= '${today}'::date or opened_at is not null then body end as body,
  (open_on > '${today}'::date and opened_at is null) as sealed`;

const todayOf = (tz?: string) => {
  // the person's own calendar day, from the browser's offset (sent with the request); defaults to UTC
  const off = Number(tz);
  const d = new Date(Date.now() - (Number.isFinite(off) ? off : 0) * 60_000);
  return d.toISOString().slice(0, 10);
};

export async function listLetters(user: string, tz?: string) {
  const q = await db();
  const rows = await q(`select ${LETTER_COLS(todayOf(tz))} from letters where user_id=$1 order by open_on, created_at`, [user]);
  return rows.map(clean);
}

export async function writeLetter(user: string, l: z.infer<typeof letterInput>, tz?: string) {
  if (l.openOn <= todayOf(tz)) throw new HttpError(400, 'Choose a day after today.');
  const q = await db();
  const id = nid('l');
  await q('insert into letters (user_id, id, body, open_on) values ($1,$2,$3,$4)', [user, id, l.body, l.openOn]);
  return id;
}

/** Open now: only for letters whose day has come, or when the person chooses to break the seal early. */
export async function openLetter(user: string, lid: string) {
  const q = await db();
  const r = await q('update letters set opened_at = coalesce(opened_at, now()) where user_id=$1 and id=$2 returning id', [user, lid]);
  if (!r.length) throw new HttpError(404, 'That letter isn’t here any more.');
}

export async function deleteLetter(user: string, lid: string) {
  const q = await db();
  await q('delete from letters where user_id=$1 and id=$2', [user, lid]);
}

/* ---------- milestones ---------- */

export const milestoneInput = z.object({
  title: z.string().trim().min(1, 'Name the day.').max(120),
  onDate: isoDate,
  note: opt(600),
});

export async function addMilestone(user: string, m: z.infer<typeof milestoneInput>) {
  const q = await db();
  const id = nid('d');
  await q('insert into milestones (user_id, id, title, on_date, note) values ($1,$2,$3,$4,$5)', [user, id, m.title, m.onDate, m.note || null]);
  return id;
}

export async function updateMilestone(user: string, mid: string, m: z.infer<typeof milestoneInput>) {
  const q = await db();
  const r = await q('update milestones set title=$3, on_date=$4, note=$5 where user_id=$1 and id=$2 returning id', [user, mid, m.title, m.onDate, m.note || null]);
  if (!r.length) throw new HttpError(404, 'That day isn’t here any more.');
}

export async function deleteMilestone(user: string, mid: string) {
  const q = await db();
  await q('delete from milestones where user_id=$1 and id=$2', [user, mid]);
}

/* ---------- everything above, at once ---------- */

export async function lifeState(user: string, tz?: string) {
  const q = await db();
  const [people, links, collections, items, letters, milestones] = await Promise.all([
    q(`select ${PERSON_COLS} from people where user_id=$1 order by lower(name)`, [user]),
    q(`select kind, a, b, note from links where user_id=$1 order by created_at`, [user]),
    q(`select ${COL_COLS} from collections where user_id=$1 order by created_at`, [user]),
    q(`select collection_id as "collectionId", kind, item_id as "id", position from collection_items where user_id=$1 order by position, added_at`, [user]),
    listLetters(user, tz),
    q(`select id, title, to_char(on_date, 'YYYY-MM-DD') as "onDate", note from milestones where user_id=$1 order by on_date`, [user]),
  ]);
  return {
    people: people.map(clean),
    links: links.map(clean),
    collections: collections.map(clean),
    collectionItems: items,
    letters,
    milestones: milestones.map(clean),
  };
}
