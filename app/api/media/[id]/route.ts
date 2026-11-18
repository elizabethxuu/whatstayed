import { deleteMedia, getMedia } from '@/lib/server/data';
import { json, withUser } from '@/lib/server/http';

type P = { id: string };

/** Only the owner can fetch a file; it is never cached publicly. */
export const GET = withUser<P>(async (_req, user, { id }) => {
  const m = await getMedia(user.id, id);
  return new Response(new Uint8Array(m.bytes), {
    headers: {
      'Content-Type': m.mime,
      'Content-Length': String(m.bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
});

export const DELETE = withUser<P>(async (_req, user, { id }) => {
  await deleteMedia(user.id, id);
  return json({ ok: true });
});
