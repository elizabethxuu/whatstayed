import { z } from 'zod';
import { db } from '@/lib/server/db';
import { entryInput, getConversation, locInput, memoryInput, saveConversation } from '@/lib/server/data';
import { body, json, withUser } from '@/lib/server/http';
import { extractMemories } from '@/lib/memory';

/**
 * Bring in what an earlier version kept in this browser. Only runs when the person asks.
 * Safe to run twice: nothing already here is overwritten.
 */
const payload = z.object({
  messages: z.array(z.object({ id: z.string(), role: z.string(), parts: z.array(z.any()) }).passthrough()).max(400).default([]),
  entries: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.number(), updatedAt: z.number().optional() })).max(5000).default([]),
  places: z
    .object({
      locations: z.record(z.unknown()).default({}),
      threads: z.array(z.object({ a: z.string(), b: z.string(), note: z.string().optional(), origin: z.enum(['you', 'suggested']) }).passthrough()).default([]),
      dismissed: z.array(z.string()).default([]),
    })
    .default({}),
});

export const POST = withUser(async (req, user) => {
  const p = await body(req, payload.parse);
  const q = await db();
  const u = user.id;
  const n = { memories: 0, entries: 0, places: 0, threads: 0, skipped: 0 };

  const mems = extractMemories(p.messages as never);
  for (const m of mems) {
    const ok = memoryInput.safeParse(m);
    if (!ok.success) {
      n.skipped++;
      continue;
    }
    const r = await q(
      `insert into memories (user_id, id, place, when_text, moment, feeling, weight, echoes, because, origin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'agent') on conflict do nothing returning id`,
      [u, m.id, ok.data.place, ok.data.when || null, ok.data.moment, ok.data.feeling, ok.data.weight, m.echoes || null, m.because || null],
    );
    n.memories += r.length;
  }
  if (p.messages.length && !(await getConversation(u)).length) await saveConversation(u, p.messages);

  for (const e of p.entries) {
    const ok = entryInput.safeParse(e);
    if (!ok.success || !e.body.trim()) {
      n.skipped++;
      continue;
    }
    const r = await q(
      `insert into entries (user_id, id, body, created_at, updated_at) values ($1,$2,$3,$4,$5) on conflict do nothing returning id`,
      [u, e.id, e.body, new Date(e.createdAt), new Date(e.updatedAt ?? e.createdAt)],
    );
    n.entries += r.length;
  }

  const have = new Set((await q<{ id: string }>('select id from memories where user_id=$1', [u])).map((r) => r.id));
  for (const [memId, raw] of Object.entries(p.places.locations)) {
    const ok = locInput.safeParse(raw);
    if (!ok.success || !have.has(memId)) {
      n.skipped++;
      continue;
    }
    const r = await q(
      `insert into locations (user_id, memory_id, data) values ($1,$2,$3::jsonb) on conflict do nothing returning memory_id`,
      [u, memId, JSON.stringify(ok.data)],
    );
    n.places += r.length;
  }
  for (const t of p.places.threads) {
    if (!have.has(t.a) || !have.has(t.b) || t.a === t.b) {
      n.skipped++;
      continue;
    }
    const dup = await q('select 1 from threads where user_id=$1 and ((a=$2 and b=$3) or (a=$3 and b=$2))', [u, t.a, t.b]);
    if (dup.length) continue;
    await q('insert into threads (user_id, id, a, b, note, origin) values ($1,$2,$3,$4,$5,$6)', [
      u,
      `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      t.a,
      t.b,
      t.note?.slice(0, 80) || null,
      t.origin,
    ]);
    n.threads++;
  }
  for (const k of p.places.dismissed.slice(0, 1000)) {
    await q('insert into dismissed (user_id, key) values ($1,$2) on conflict do nothing', [u, k.slice(0, 200)]);
  }
  return json({ imported: n });
});
