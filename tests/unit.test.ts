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

import { greeting, profileSchema, promptFor, PROMPTS } from '../lib/profile.ts';

test('the daily reflection is one question per day, and another can be asked for', () => {
  const d = new Date(2026, 10, 19, 9);
  assert.equal(promptFor(d), promptFor(new Date(2026, 10, 19, 22)), 'the same all day');
  assert.notEqual(promptFor(d), promptFor(new Date(2026, 10, 20, 9)), 'a new one tomorrow');
  assert.notEqual(promptFor(d, 1), promptFor(d));
  assert.equal(promptFor(d, PROMPTS.length), promptFor(d), 'wraps round');
  assert.equal(promptFor(d, -1), promptFor(d, PROMPTS.length - 1), 'and backwards');
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
