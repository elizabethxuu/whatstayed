import { z } from 'zod';

export const creds = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});
