/**
 * Conversations ("talks") and the memories the agent drafts in them.
 * Drafts never reach the garden on their own: only reviewSave() turns them into memories,
 * after the person has read, edited and chosen them.
 */
import { z } from 'zod';
import { db, ms } from './db';
import { HttpError } from './http';
import { isoDate, locInput, setLocation, tie, saveEntry, setEntryLocation } from './data';
import { addToCollection, createCollection, createPerson, link, ownPerson } from './life';
import { periodToDate, UNSURE_FIELDS, type Draft, type MemoryExtra, type StoredDraft, type TalkSummary, type Trip } from '../draft';

const nid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clean = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as T;
const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

/* ---------- talks ---------- */

const TALK_COLS = `t.id, t.title, t.mode, t.trip, ${ms('t.created_at')} as "createdAt", ${ms('t.updated_at')} as "updatedAt",
  (select count(*)::int from drafts d where d.user_id = t.user_id and d.talk_id = t.id and d.status = 'draft') as drafts,
  (select count(*)::int from drafts d where d.user_id = t.user_id and d.talk_id = t.id and d.status = 'saved') as saved`;

export async function listTalks(user: string): Promise<TalkSummary[]> {
  const q = await db();
  const rows = await q(`select ${TALK_COLS} from talks t where t.user_id=$1 order by t.updated_at desc limit 200`, [user]);
  return rows.map((r) => clean({ ...r, trip: r.trip ? parse<Trip>(r.trip) : null })) as unknown as TalkSummary[];
}

export async function ownTalk(user: string, tid: string) {
  const q = await db();
  const r = await q<{ mode: string; title: string; trip: unknown }>('select mode, title, trip from talks where user_id=$1 and id=$2', [user, tid]);
  if (!r.length) throw new HttpError(404, 'That conversation isn’t here any more.');
  return { mode: r[0].mode as 'free' | 'trip', title: r[0].title, trip: r[0].trip ? parse<Trip>(r[0].trip) : undefined };
}

export async function createTalk(user: string, mode: 'free' | 'trip') {
  const q = await db();
  const id = nid('t');
  await q('insert into talks (user_id, id, mode) values ($1,$2,$3)', [user, id, mode]);
  return (await listTalks(user)).find((t) => t.id === id)!;
}

export async function getTalk(user: string, tid: string) {
  const q = await db();
  const rows = await q<{ messages: unknown }>('select messages from talks where user_id=$1 and id=$2', [user, tid]);
  if (!rows.length) throw new HttpError(404, 'That conversation isn’t here any more.');
  const summary = (await listTalks(user)).find((t) => t.id === tid)!;
  return { talk: summary, messages: parse<unknown[]>(rows[0].messages) ?? [], drafts: await listDrafts(user, tid) };
}

export async function latestTalk(user: string) {
  const q = await db();
  const r = await q<{ id: string }>('select id from talks where user_id=$1 order by updated_at desc limit 1', [user]);
  return r[0]?.id ?? null;
}

export async function saveTalk(user: string, tid: string, messages: unknown[]) {
  const text = JSON.stringify(messages);
  if (text.length > 1_500_000) throw new HttpError(413, 'This conversation has grown too long to save. Start a new one.');
  const q = await db();
  // a conversation is named by how it began, unless a trip names it later
  const first = (messages as { role?: string; parts?: { type?: string; text?: string }[] }[]).find((m) => m.role === 'user');
  const opening = first?.parts?.find((p) => p.type === 'text')?.text?.trim().replace(/\s+/g, ' ') ?? '';
  const title = opening.length > 64 ? opening.slice(0, 62).replace(/\s+\S*$/, '') + '…' : opening;
  const r = await q(
    `update talks set messages=$3::jsonb, updated_at=now(), title = case when title = '' then $4 else title end
     where user_id=$1 and id=$2 returning id`,
    [user, tid, text, title],
  );
  if (!r.length) throw new HttpError(404, 'That conversation isn’t here any more.');
}

export async function nameTrip(user: string, tid: string, trip: Trip) {
  const q = await db();
  await q(`update talks set trip=$3::jsonb, title=$4, updated_at=now() where user_id=$1 and id=$2`, [user, tid, JSON.stringify(trip), trip.title]);
}

/** Deleting a conversation removes its words and unsaved drafts. Memories already saved from it stay. */
export async function deleteTalk(user: string, tid: string) {
  const q = await db();
  const r = await q('delete from talks where user_id=$1 and id=$2 returning id', [user, tid]);
  if (!r.length) throw new HttpError(404, 'That conversation isn’t here any more.');
  await q(`delete from drafts where user_id=$1 and talk_id=$2`, [user, tid]);
}

/* ---------- drafts ---------- */

export async function listDrafts(user: string, tid: string): Promise<StoredDraft[]> {
  const q = await db();
  const rows = await q(
    `select id, talk_id as "talkId", status, memory_id as "memoryId", data, ${ms('created_at')} as "createdAt", ${ms('updated_at')} as "updatedAt"
     from drafts where user_id=$1 and talk_id=$2 and status <> 'discarded' order by created_at, id`,
    [user, tid],
  );
  return rows.map((r) => clean({ ...r, data: parse<Draft>(r.data) })) as unknown as StoredDraft[];
}

/** The agent's draftMemory tool lands here. A correction replaces the earlier draft rather than adding another. */
export async function upsertDraft(user: string, tid: string, callId: string, d: Draft) {
  const q = await db();
  const { replaces, ...data } = d;
  if (replaces) {
    const r = await q(
      `update drafts set data=$4::jsonb, updated_at=now() where user_id=$1 and talk_id=$2 and id=$3 and status='draft' returning id`,
      [user, tid, replaces, JSON.stringify(data)],
    );
    if (r.length) return replaces;
  }
  await q(
    `insert into drafts (user_id, id, talk_id, data) values ($1,$2,$3,$4::jsonb) on conflict (user_id, id) do nothing`,
    [user, callId, tid, JSON.stringify(data)],
  );
  await q('update talks set updated_at=now() where user_id=$1 and id=$2', [user, tid]);
  return callId;
}

export async function discardDrafts(user: string, tid: string, ids?: string[]) {
  await ownTalk(user, tid);
  const q = await db();
  if (ids?.length) {
    await q(`update drafts set status='discarded', updated_at=now() where user_id=$1 and talk_id=$2 and status='draft' and id = any($3::text[])`, [user, tid, ids]);
  } else {
    await q(`update drafts set status='discarded', updated_at=now() where user_id=$1 and talk_id=$2 and status='draft'`, [user, tid]);
  }
}

/* ---------- review: the person's confirmed version becomes real ---------- */

const period = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Use a year, a month or a day.');

export const reviewItem = z.object({
  draftId: z.string().min(1).max(80),
  title: z.string().trim().min(1, 'Give it a title.').max(80),
  moment: z.string().trim().min(2, 'Add a line about the moment.').max(600),
  narrative: z.string().trim().max(2000).optional(),
  place: z.string().trim().min(1, 'Add a place.').max(80),
  when: z.string().trim().max(60).optional(),
  date: period.optional(),
  feeling: z.string().trim().max(40).optional(),
  weight: z.enum(['light', 'tender', 'heavy']),
  people: z.array(z.object({ name: z.string().trim().min(1).max(80), personId: z.string().max(80).optional() })).max(12).default([]),
  senses: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  objects: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  unsure: z.array(z.enum(UNSURE_FIELDS)).max(6).default([]),
  location: locInput.nullable().optional(),
  connections: z.array(z.object({ to: z.string().min(1).max(80), note: z.string().trim().max(80).optional() })).max(6).default([]),
});

export const reviewInput = z.object({
  items: z.array(reviewItem).min(1, 'Choose at least one memory to save.').max(30),
  trip: z
    .object({
      title: z.string().trim().min(1).max(80),
      collection: z.boolean().default(true),
      narrative: z.string().trim().max(20_000).optional(),
    })
    .optional(),
});

export async function reviewSave(user: string, tid: string, input: z.infer<typeof reviewInput>) {
  const talk = await ownTalk(user, tid);
  const q = await db();
  const waiting = new Map((await listDrafts(user, tid)).filter((d) => d.status === 'draft').map((d) => [d.id, d]));
  for (const it of input.items) if (!waiting.has(it.draftId)) throw new HttpError(409, 'One of these drafts was already saved or discarded. Reload to see the latest.');

  // people are matched by name, or created, once per save
  const known = new Map((await q<{ id: string; name: string }>('select id, name from people where user_id=$1', [user])).map((p) => [p.name.trim().toLowerCase(), p.id]));
  async function personFor(p: { name: string; personId?: string }) {
    if (p.personId) {
      await ownPerson(user, p.personId);
      return p.personId;
    }
    const k = p.name.trim().toLowerCase();
    if (known.has(k)) return known.get(k)!;
    const made = (await createPerson(user, { name: p.name.trim() })) as { id: string };
    known.set(k, made.id);
    return made.id;
  }

  const made: { draftId: string; memoryId: string }[] = [];
  const toMemory = new Map<string, string>();
  for (const it of input.items) {
    const memId = nid('m');
    const { date, label } = periodToDate(it.date);
    if (date) isoDate.parse(date);
    const precision: MemoryExtra['precision'] | undefined = it.date ? (['year', 'month', 'day'] as const)[it.date.split('-').length - 1] : undefined;
    const extra: MemoryExtra = {
      title: it.title,
      narrative: it.narrative || undefined,
      senses: it.senses.length ? it.senses : undefined,
      objects: it.objects.length ? it.objects : undefined,
      unsure: it.unsure.length ? it.unsure : undefined,
      precision,
      trip: talk.mode === 'trip' && input.trip ? { talkId: tid, title: input.trip.title } : undefined,
      from: 'conversation',
    };
    await q(
      `insert into memories (user_id, id, place, when_text, moment, feeling, weight, origin, happened_on, extra)
       values ($1,$2,$3,$4,$5,$6,$7,'agent',$8,$9::jsonb)`,
      [user, memId, it.place, it.when || label || null, it.moment, it.feeling || '', it.weight, date || null, JSON.stringify(extra)],
    );
    toMemory.set(it.draftId, memId);
    made.push({ draftId: it.draftId, memoryId: memId });
    if (it.location) await setLocation(user, memId, it.location);
    for (const p of it.people) await link(user, { kind: 'memory-person', a: memId, b: await personFor(p) });
    await q(`update drafts set status='saved', memory_id=$3, updated_at=now() where user_id=$1 and id=$2`, [user, it.draftId, memId]);
  }

  // accepted connections become red threads: to memories already in the garden, or between memories saved now
  for (const it of input.items) {
    const from = toMemory.get(it.draftId)!;
    for (const c of it.connections) {
      const to = toMemory.get(c.to) ?? c.to;
      if (to === from) continue;
      try {
        await tie(user, { a: from, b: to, note: c.note || undefined, origin: 'suggested' });
      } catch {
        /* a memory that no longer exists, or a draft not saved this time: skip the thread */
      }
    }
  }

  // a trip becomes a collection, and its story a page in the Archives
  let collectionId: string | undefined;
  let entryId: string | undefined;
  if (input.trip && talk.mode === 'trip') {
    if (input.trip.narrative) {
      entryId = nid('e');
      await saveEntry(user, { id: entryId, body: `${input.trip.title}\n\n${input.trip.narrative}`, createdAt: Date.now() });
      const firstLoc = input.items.find((i) => i.location)?.location;
      if (firstLoc) await setEntryLocation(user, entryId, firstLoc);
      for (const m of made) await link(user, { kind: 'entry-memory', a: entryId, b: m.memoryId, note: 'From this trip' });
    }
    if (input.trip.collection) {
      const c = (await createCollection(user, { name: input.trip.title, description: 'A trip, told in conversation.' })) as { id: string };
      collectionId = c.id;
      for (const m of made) await addToCollection(user, c.id, { kind: 'memory', id: m.memoryId });
      if (entryId) await addToCollection(user, c.id, { kind: 'entry', id: entryId });
    }
  }
  await q('update talks set updated_at=now() where user_id=$1 and id=$2', [user, tid]);
  return { made, collectionId, entryId };
}

/* ---------- rate limits ---------- */

/** Fixed-window counter in Postgres. Returns false once `limit` is reached inside the window. */
export async function allow(key: string, limit: number, windowSec: number, count = true) {
  const q = await db();
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  if (!count) {
    const r = await q<{ count: number }>('select count from rate_hits where key=$1 and bucket=$2', [key, bucket]);
    return (r[0]?.count ?? 0) < limit;
  }
  const r = await q<{ count: number }>(
    `insert into rate_hits (key, bucket, count) values ($1,$2,1)
     on conflict (key, bucket) do update set count = rate_hits.count + 1 returning count`,
    [key, bucket],
  );
  if (Math.random() < 0.05) await q('delete from rate_hits where key=$1 and bucket < $2', [key, bucket - 2]);
  return r[0].count <= limit;
}
