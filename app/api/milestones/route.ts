import { addMilestone, milestoneInput } from '@/lib/server/life';
import { body, json, withUser } from '@/lib/server/http';

export const POST = withUser(async (req, user) => json({ id: await addMilestone(user.id, await body(req, milestoneInput.parse)) }, 201));
