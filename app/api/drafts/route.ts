import { listDrafts, saveHandDraft } from '@/lib/server/talk';
import { body, json, withUser } from '@/lib/server/http';

/** Unfinished memories, added by hand. */
export const GET = withUser(async (_req, user) => json({ drafts: await listDrafts(user.id, 'by-hand') }));

export const POST = withUser(async (req, user) => json({ id: await saveHandDraft(user.id, null, await body(req, (v) => v)) }, 201));
