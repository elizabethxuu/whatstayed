import { currentUser } from '@/lib/server/auth';
import { json, open } from '@/lib/server/http';

export const GET = open(async () => json({ user: await currentUser() }));
