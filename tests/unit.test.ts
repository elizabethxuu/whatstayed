// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zip } from '../lib/zip.ts';
import { echoOf, extractMemories, memorySchema } from '../lib/memory.ts';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip writes a readable archive with every file', async () => {
  const blob = zip([
    { name: 'a.txt', data: new TextEncoder().encode('hello') },
    { name: 'media/b.bin', data: new Uint8Array([1, 2, 3]) },
  ]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  const end = buf.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50, 'end of central directory');
  assert.equal(view.getUint16(end + 10, true), 2, 'two entries');
  assert.equal(view.getUint32(0, true), 0x04034b50, 'first local header');
});

test('echoOf finds the earlier memory by place, never a later one', () => {
  const ms = [
    { place: 'Lisbon', moment: 'bells', feeling: 'held', weight: 'tender' as const },
    { place: 'Sintra', moment: 'sardines', feeling: 'free', weight: 'light' as const, echoes: 'lisbon' },
    { place: 'Porto', moment: 'rain', feeling: 'still', weight: 'tender' as const, echoes: 'Nowhere' },
  ];
  assert.equal(echoOf(ms, 1), 0);
  assert.equal(echoOf(ms, 2), null);
  assert.equal(echoOf(ms, 0), null);
});

test('extractMemories keeps only planted tool calls, keyed by call id', () => {
  const input = { place: 'Kyoto', moment: 'Rain on the roof', feeling: 'still', weight: 'tender' };
  const out = extractMemories([
    { parts: [{ type: 'text' }] },
    { parts: [{ type: 'tool-plantMemory', state: 'output-available', toolCallId: 'x1', input }] },
    { parts: [{ type: 'tool-plantMemory', state: 'input-streaming', toolCallId: 'x2', input }] },
  ]);
  assert.deepEqual(out, [{ ...input, id: 'x1' }]);
});

test('memorySchema rejects a memory with no moment', () => {
  assert.equal(memorySchema.safeParse({ place: 'A', moment: '', feeling: 'x', weight: 'light' }).success, false);
});

import { draftSchema, periodToDate } from '../lib/draft.ts';

test('approximate dates keep their precision for the Timeline', () => {
  assert.deepEqual(periodToDate('2025-10'), { date: '2025-10-01', label: 'October 2025' });
  assert.deepEqual(periodToDate('2019'), { date: '2019-01-01', label: '2019' });
  assert.equal(periodToDate('2024-06-14').date, '2024-06-14');
  assert.deepEqual(periodToDate(undefined), {});
});

test('a draft needs a title, a moment and a place; dates must be real periods', () => {
  const base = { title: 'The bookstore', moment: 'Finding a tiny bookstore', place: 'Edinburgh' };
  assert.equal(draftSchema.safeParse(base).success, true);
  assert.equal(draftSchema.safeParse({ ...base, place: '' }).success, false);
  assert.equal(draftSchema.safeParse({ ...base, date: 'last October' }).success, false);
  assert.equal(draftSchema.safeParse({ ...base, date: '2025-10' }).success, true);
  assert.equal(draftSchema.parse(base).weight, 'light');
});

import { greeting, profileSchema } from '../lib/profile.ts';
import { questionsFor } from '../lib/questions.ts';

const base = { profile: {}, memories: [], people: [], with: {}, city: {}, answered: [] };
const garden = {
  ...base,
  profile: { home: 'Queens', intention: 'The sound of the old house', remember: ['people', 'little'] },
  memories: [
    { id: 'm1', place: 'Hanoi', moment: 'Coffee with condensed milk on a tiny stool', date: '2023-11-19', createdAt: 1 },
    { id: 'm2', place: 'Hanoi', moment: 'The motorbike ride in the rain', createdAt: 2 },
    { id: 'm3', place: 'Marfa', moment: 'Stars over the desert road', createdAt: 3 },
  ],
  people: [{ id: 'p1', name: 'Ama' }],
  with: { m3: ['Ama'] },
};

test('questions are built only from what this person kept', () => {
  const qs = questionsFor({ seed: 'a@x.co', ...garden }, new Date(2026, 10, 19, 9));
  const all = qs.map((q) => q.text).join(' ');
  assert.ok(qs.length >= 6);
  for (const word of ['Paris', 'Taipei', 'Edinburgh', 'grandmother', 'Lisbon']) assert.ok(!all.includes(word), `no stock reference to ${word}`);
  assert.ok(/Hanoi|Marfa|Ama|Queens|old house/.test(all));
});

test('a date that comes round again leads', () => {
  const [first] = questionsFor({ seed: 'a@x.co', ...garden }, new Date(2026, 10, 19, 9));
  assert.match(first.text, /^3 years ago today: “Coffee with condensed milk on a tiny stool”, in Hanoi\./);
  assert.equal(first.about?.id, 'm1');
});

test('the order is stable within a day, and differs between people', () => {
  const d = new Date(2026, 10, 20, 9);
  const a = questionsFor({ seed: 'a@x.co', ...garden }, d).map((q) => q.text);
  assert.deepEqual(a, questionsFor({ seed: 'a@x.co', ...garden }, new Date(2026, 10, 20, 22)).map((q) => q.text));
  const b = questionsFor({ seed: 'someone-else@x.co', ...garden }, d).map((q) => q.text);
  assert.notDeepEqual(a, b);
});

test('a question already answered moves to the back', () => {
  const d = new Date(2026, 10, 20, 9);
  const [first] = questionsFor({ seed: 'a@x.co', ...garden }, d);
  const again = questionsFor({ seed: 'a@x.co', ...garden, answered: [first.text] }, d);
  assert.notEqual(again[0].text, first.text);
  assert.equal(again[again.length - 1].text, first.text);
});

test('a brand-new garden still gets a question, shaped by what they chose', () => {
  const empty = questionsFor({ seed: 'n@x.co', ...base }, new Date(2026, 0, 1));
  assert.equal(empty.length, 1);
  const chose = questionsFor({ seed: 'n@x.co', ...base, profile: { remember: ['little'] } }, new Date(2026, 0, 1));
  assert.match(chose[0].text, /small thing/);
});

test('the greeting follows the hour', () => {
  assert.equal(greeting(new Date(2026, 0, 1, 8)), 'Good morning');
  assert.equal(greeting(new Date(2026, 0, 1, 14)), 'Good afternoon');
  assert.equal(greeting(new Date(2026, 0, 1, 21)), 'Good evening');
});

test('the profile accepts only what it knows', () => {
  assert.ok(profileSchema.safeParse({ name: 'Liz', remember: ['places'], start: 'past', appearance: 'dark', birthday: '' }).success);
  assert.ok(!profileSchema.safeParse({ appearance: 'neon' }).success);
  assert.ok(!profileSchema.safeParse({ remember: ['secrets'] }).success);
  assert.ok(!profileSchema.safeParse({ birthday: 'May 2' }).success);
  const p = profileSchema.parse({ name: '  Liz  ', admin: true } as unknown as object);
  assert.equal(p.name, 'Liz');
  assert.ok(!('admin' in p), 'unknown keys are dropped');
});
