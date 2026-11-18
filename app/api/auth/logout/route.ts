import { endSession } from '@/lib/server/auth';
import { json, open } from '@/lib/server/http';

export const POST = open(async () => {
  await endSession();
  return json({ ok: true });
});
