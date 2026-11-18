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
