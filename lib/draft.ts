import { z } from 'zod';

/**
 * A memory the agent has drafted from the conversation. Nothing here is saved to the garden
 * until the person reviews it and says so. Every field is the person's own information;
 * "unsure" marks what they weren't certain of.
 */
export const UNSURE_FIELDS = ['title', 'moment', 'place', 'when', 'date', 'people'] as const;

export const draftSchema = z.object({
  title: z.string().min(1).max(80).describe('A short title for this one memory, in plain words. "The bookstore in the Old Town".'),
  moment: z
    .string()
    .min(3)
    .max(200)
    .describe('The memory in one line, as close to their own words as possible. Never add details they did not give.'),
  narrative: z
    .string()
    .max(1200)
    .optional()
    .describe('Optional: a few sentences in their own words, gathered from what they said about this moment. No embellishment.'),
  place: z.string().min(1).max(80).describe('Where it happened, as they named it: a city, a street, a café, a train.'),
  when: z.string().max(60).optional().describe('When, as they said it: "October 2025", "last spring", "the night before I left". Omit if unknown.'),
  date: z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
    .optional()
    .describe('The same time as a date, only if it can be worked out from what they said: "2025", "2025-10" or "2025-10-14". Resolve "last October" using today’s date and mark "date" as unsure. Omit if unknown.'),
  people: z.array(z.string().min(1).max(60)).max(10).optional().describe('Names or roles of people who were there, as they said them: "my sister", "Mei".'),
  senses: z.array(z.string().min(1).max(100)).max(8).optional().describe('Sensory details they mentioned, in their words: "rain on the windows", "old wooden shelves".'),
  objects: z.array(z.string().min(1).max(60)).max(6).optional().describe('Significant objects they mentioned: "a paperback", "a red umbrella".'),
  feeling: z.string().max(40).optional().describe('One plain word for the moment, only if they said it or clearly implied it.'),
  weight: z
    .enum(['light', 'tender', 'heavy'])
    .default('light')
    .describe('The blossom: light = white (most memories), tender = pale grey heart (quieter, personal), heavy = red heart (only if they say it matters a great deal).'),
  unsure: z.array(z.enum(UNSURE_FIELDS)).max(6).optional().describe('Fields the person said they were not sure about, or that you inferred.'),
  related: z
    .array(z.object({ id: z.string().min(1).max(80), reason: z.string().min(1).max(80) }))
    .max(4)
    .optional()
    .describe('Possible connections to memories listed as already in the garden (by id), or to other drafts in this conversation (by draft id). A suggestion only; the person decides. Use sparingly and only for real links: the same person, the same place, a place they returned to.'),
  replaces: z.string().max(80).optional().describe('When the person corrects or adds to a memory you already drafted, give that draft’s id here instead of drafting a new one.'),
});

export type Draft = z.infer<typeof draftSchema>;

export const tripSchema = z.object({
  title: z.string().min(1).max(80).describe('A plain title for the whole trip: "Edinburgh, October 2025".'),
  place: z.string().max(80).optional(),
  when: z.string().max(60).optional(),
});

export type Trip = z.infer<typeof tripSchema>;

export type StoredDraft = {
  id: string;
  talkId: string;
  status: 'draft' | 'saved' | 'discarded';
  memoryId?: string;
  data: Draft;
  createdAt: number;
  updatedAt: number;
};

export type TalkSummary = {
  id: string;
  title: string;
  mode: 'free' | 'trip';
  trip?: Trip;
  createdAt: number;
  updatedAt: number;
  drafts: number; // waiting for review
  saved: number;
};

/** "2025-10" → first day, plus a human phrase when none was given. */
export function periodToDate(p?: string): { date?: string; label?: string } {
  if (!p) return {};
  const [y, m, d] = p.split('-');
  const date = `${y}-${m || '01'}-${d || '01'}`;
  if (Number.isNaN(Date.parse(date + 'T12:00:00Z'))) return {};
  const label = d
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : m
      ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : y;
  return { date, label };
}

/** Extra detail a memory keeps from the conversation it came from. */
export type MemoryExtra = {
  title?: string;
  narrative?: string;
  senses?: string[];
  objects?: string[];
  unsure?: string[];
  precision?: 'year' | 'month' | 'day';
  trip?: { talkId: string; title: string };
  from?: 'conversation';
};
