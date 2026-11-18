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
});

export type Memory = z.infer<typeof memorySchema>;
