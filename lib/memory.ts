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
    .describe('When, only if they said it. "Summer 2019", "the night before I left". Omit if unknown.'),
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
    .describe('One or two words for the feeling they described or clearly implied. "Free", "homesick", "held".'),
  weight: z
    .enum(['light', 'tender', 'heavy'])
    .describe(
      'light = joyful or easy. tender = warm, bittersweet, close to the heart. heavy = grief, loss, or something that still aches.',
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

export const CHAT_KEY = 'whatstayed:v1';

/** Read memories straight from the saved conversation (for rooms other than the garden). */
export function loadKept(): Kept[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    const msgs = raw ? JSON.parse(raw) : [];
    return Array.isArray(msgs) ? extractMemories(msgs) : [];
  } catch {
    return [];
  }
}
