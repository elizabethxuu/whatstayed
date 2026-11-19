// Sign a test context up (fresh account) or share another context's session.
const B = 'http://localhost:3100';
let n = 0;
exports.signup = async (ctx, email) => {
  const r = await ctx.request.post(B + '/api/auth/signup', {
    data: { email: email || `t${Date.now()}${n++}@example.com`, password: 'test-garden-1' },
    headers: { origin: B },
  });
  if (r.status() !== 201) throw new Error('signup failed ' + r.status() + ' ' + (await r.text()));
};
exports.share = async (from, to) => {
  const ck = (await from.cookies()).filter((c) => c.name === 'ws_session');
  await to.addCookies(ck);
};
exports.state = (page) => page.evaluate(async () => (await fetch('/api/state')).json());
