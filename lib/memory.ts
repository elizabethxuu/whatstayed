import { z } from 'zod';

/** One memory, as the agent plants it on the tree. */
export const memorySchema = z.object({
  place: z
    .string()
    .min(1)
    .max(60)
    .describe('Where it happened, as the person named it. A city, a beach, a kitchen, a train.'),
  when: z
    .string()
    .max(40)
    .optional()
    .describe('When, only if they said it, in their words (a season, a year, an occasion). Omit if unknown.'),
  moment: z
    .string()
    .min(3)
    .max(120)
    .describe(
      'The memory itself in one short line, kept as close to their own words as possible. Never add details they did not give.',
    ),
  feeling: z
    .string()
    .min(1)
    .max(24)
    .describe('One plain word for the moment, from what they said. "Calm", "bright", "busy".'),
  weight: z
    .enum(['light', 'tender', 'heavy'])
    .describe(
      'The blossom: light = a white blossom (most memories). tender = a pale grey heart (quieter, more personal). heavy = a red heart, only for a memory they say matters a great deal.',
    ),
  echoes: z
    .string()
    .max(60)
    .optional()
    .describe(
      'Only if this memory is meaningfully connected to one planted earlier: the same person, a place they returned to, or a link they drew themselves. Give the earlier memory\'s place exactly as it was planted. Omit otherwise; most memories have no echo.',
    ),
  because: z
    .string()
    .max(60)
    .optional()
    .describe('With echoes only: a few words on what connects them, in their words. "Both with my mother".'),
});

/** Find the earlier memory a memory echoes, if any. */
export function echoOf(memories: Memory[], i: number): number | null {
  const want = memories[i]?.echoes?.trim().toLowerCase();
  if (!want) return null;
  for (let j = i - 1; j >= 0; j--) if (memories[j].place.trim().toLowerCase() === want) return j;
  for (let j = i - 1; j >= 0; j--) if (memories[j].moment.toLowerCase().includes(want)) return j;
  return null;
}

export type Memory = z.infer<typeof memorySchema>;

/** A planted memory with the stable id of the moment it was planted. */
export type Kept = Memory & { id: string };

type PartLike = { type: string; state?: string; input?: unknown; toolCallId?: string };

/** Every memory planted in a conversation, in order. */
export function extractMemories(messages: { parts: PartLike[] }[]): Kept[] {
  const out: Kept[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type !== 'tool-plantMemory') continue;
      if (p.state !== 'input-available' && p.state !== 'output-available') continue;
      if (!p.input || typeof p.input !== 'object') continue;
      out.push({ ...(p.input as Memory), id: p.toolCallId || `m${out.length}` });
    }
  }
  return out;
}

/** Where an earlier version kept the conversation, in this browser only. Read once, to offer an import. */
export const LEGACY_CHAT_KEY = 'whatstayed:v1';
