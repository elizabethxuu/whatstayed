import { creds } from '@/lib/server/creds';
import { body, HttpError, json, open } from '@/lib/server/http';
import { createReset, resetConfigured, sendResetEmail } from '@/lib/server/profile';
import { allow } from '@/lib/server/talk';

const SENT = 'If there’s a garden for that email, a link to reset the password is on its way. It works for one hour.';

export const POST = open(async (req) => {
  const { email } = await body(req, (v) => {
    const r = creds.pick({ email: true }).safeParse(v);
    if (!r.success) throw new HttpError(400, 'Please enter your email.');
    return r.data;
  });
  const test = process.env.WHATSTAYED_MOCK === '1';
  if (!resetConfigured() && !test) {
    throw new HttpError(503, 'Password reset by email isn’t set up on this site yet. If you’re signed in elsewhere, you can change your password under You.');
  }
  if (!(await allow(`reset:${email}`, 3, 3600))) throw new HttpError(429, 'A link was sent recently. Please check your email, or try again later.');
  const token = await createReset(email);
  const origin = new URL(req.url).origin;
  const link = token ? `${origin}/welcome?reset=${token}` : null;
  if (link && !test) await sendResetEmail(email, link);
  // In the scripted test mode only, hand the link back so the flow can be tested without email.
  return json(test ? { message: SENT, testLink: link } : { message: SENT });
});
