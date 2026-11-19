import { createPerson, personInput } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => json({ person: await createPerson(user.id, await body(req, personInput.parse)) }, 201));
