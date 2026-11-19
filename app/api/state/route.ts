import { state } from '@/lib/server/data';
import { json, withUser } from '@/lib/server/http';
import { tzOffset } from '@/lib/server/auth';

export const GET = withUser(async (_req, user) => json(await state(user.id, await tzOffset())));
