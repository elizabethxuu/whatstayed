import { ZodError } from 'zod';
import { ConfigError } from './db';
import { currentUser, type User } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** Refuse cross-site writes: a mutating request must come from this same site. */
function sameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients; session cookie is still required
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return false;
  }
}

function fail(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ZodError) return json({ error: 'Some of that didn’t look right.', issues: e.issues.map((i) => i.path.join('.')) }, 400);
  if (e instanceof ConfigError) return json({ error: e.message }, 503);
  console.error(e);
  return json({ error: 'Something went wrong on our side.' }, 500);
}

type Ctx<P> = { params: Promise<P> };

/** Wrap a handler: same-origin check, signed-in user, and tidy errors. */
export function withUser<P = Record<string, never>>(
  fn: (req: Request, user: User, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
      const user = await currentUser();
      if (!user) throw new HttpError(401, 'Please sign in.');
      return await fn(req, user, ctx ? await ctx.params : ({} as P));
    } catch (e) {
      return fail(e);
    }
  };
}

export function open<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      if (!sameOrigin(req)) throw new HttpError(403, 'Not allowed.');
      return await fn(req, ctx ? await ctx.params : ({} as P));
    } catch (e) {
      return fail(e);
    }
  };
}

export async function body<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let v: unknown;
  try {
    v = await req.json();
  } catch {
    throw new HttpError(400, 'Expected JSON.');
  }
  return parse(v);
}
