import { deleteMilestone, milestoneInput, updateMilestone } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

type P = { id: string };
export const PATCH = withUser<P>(async (req, user, { id }) => {
  await updateMilestone(user.id, id, await body(req, milestoneInput.parse));
  return json({ ok: true });
});
export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteMilestone(user.id, id);
  return json({ ok: true });
});
