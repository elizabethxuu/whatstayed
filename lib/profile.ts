import { z } from 'zod';

/** What someone tells What Stayed about themselves. Everything is optional; nothing is shared. */
export const REMEMBER = ['places', 'people', 'moments', 'little', 'reflections', 'chapters'] as const;
export const WAYS = ['photos', 'writing', 'places', 'people', 'everything'] as const;
export const STARTS = ['past', 'today', 'gradual'] as const;

export const REMEMBER_LABEL: Record<(typeof REMEMBER)[number], string> = {
  places: 'The places I’ve been',
  people: 'The people I’ve met',
  moments: 'The moments that changed me',
  little: 'The little things I don’t want to forget',
  reflections: 'My thoughts and reflections',
  chapters: 'The different chapters of my life',
};
export const WAYS_LABEL: Record<(typeof WAYS)[number], string> = {
  photos: 'Photographs',
  writing: 'Writing and journaling',
  places: 'Places and experiences',
  people: 'Conversations and people',
  everything: 'A little bit of everything',
};
export const STARTS_LABEL: Record<(typeof STARTS)[number], string> = {
  past: 'Revisit memories I already have',
  today: 'Start collecting moments from today',
  gradual: 'Build my archive gradually',
};

export const profileSchema = z.object({
  name: z.string().trim().max(60).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  home: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(60).optional(),
  intention: z.string().trim().max(600).optional(),
  showIntention: z.boolean().optional(),
  remember: z.array(z.enum(REMEMBER)).max(REMEMBER.length).optional(),
  ways: z.array(z.enum(WAYS)).max(WAYS.length).optional(),
  start: z.enum(STARTS).optional(),
  reminders: z
    .object({
      evening: z.boolean(),
      weekly: z.boolean(),
      yearAgo: z.boolean(),
      time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    })
    .partial()
    .optional(),
  appearance: z.enum(['system', 'light', 'dark']).optional(),
  reflection: z.object({ enabled: z.boolean() }).partial().optional(),
  locationAsk: z.enum(['ask', 'never']).optional(),
  proactive: z.boolean().optional(),
  photoId: z.string().max(40).nullable().optional(),
  onboarded: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

export type Profile = z.infer<typeof profileSchema>;

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
