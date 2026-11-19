import { collectionInput, createCollection } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => json({ collection: await createCollection(user.id, await body(req, collectionInput.parse)) }, 201));
