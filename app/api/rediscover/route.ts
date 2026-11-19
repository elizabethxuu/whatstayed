import { rediscover } from '@/lib/server/rediscover';
import { json, withUser } from '@/lib/server/http';

/** Gentle suggestions for revisiting the archive, each with its evidence. Empty when turned off. */
export const GET = withUser(async (_req, user) => json({ suggestions: await rediscover(user.id) }));
