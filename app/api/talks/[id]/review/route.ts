import { reviewInput, reviewSave } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };

/** The person's reviewed, edited choice of drafts becomes memories, places, people, threads, and for a trip a collection and a page. */
export const POST = withUser<P>(async (req, user, { id }) => json(await reviewSave(user.id, id, await body(req, reviewInput.parse)), 201));
