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

/** Rotating reflections: one a day, the same for everyone on a given day. */
export const PROMPTS = [
  'What is something you wish you could experience again?',
  'Who made today feel different?',
  'What small detail would you like to remember?',
  'Where did you feel most like yourself?',
  'What has changed about you this year?',
  'What did you notice today that you usually walk past?',
  'Which place have you been thinking about lately?',
  'What did someone say to you that you want to keep?',
  'What smell or sound takes you back somewhere?',
  'What would you tell yourself from a year ago?',
  'What was the light like today?',
  'Which meal do you still remember, and who was at the table?',
  'What is something you learned from someone older than you?',
  'What made you laugh this week?',
];

export function promptFor(day: Date, offset = 0) {
  const n = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000);
  return PROMPTS[(((n + offset) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
