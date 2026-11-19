import { z } from 'zod';
import { addMedia } from '@/lib/server/data';
import { HttpError, json, withUser } from '@/lib/server/http';

const meta = z.object({
  ownerType: z.enum(['memory', 'entry', 'person', 'profile']),
  ownerId: z.string().min(1).max(80),
  kind: z.enum(['photo', 'voice']),
  durationMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
});

export const POST = withUser(async (req, user) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'Expected a file.');
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) throw new HttpError(400, 'Expected a file.');
  const m = meta.parse({
    ownerType: form.get('ownerType'),
    ownerId: form.get('ownerType') === 'profile' ? user.id : form.get('ownerId'),
    kind: form.get('kind'),
    durationMs: form.get('durationMs') || undefined,
  });
  const media = await addMedia(user.id, { type: m.ownerType, id: m.ownerId }, m.kind, {
    mime: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
    durationMs: m.durationMs,
  });
  return json({ media }, 201);
});
