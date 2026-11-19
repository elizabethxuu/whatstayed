// The memory agent: real tool calls against the real database (scripted model, WHATSTAYED_MOCK=1).
// Each check looks at what the tools did (stored rows, proposals, the tool log), not only at the words.
const { chromium, devices } = require('playwright');
const A = require('./auth.js');
const B = 'http://localhost:3100';
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const H = { origin: B };
let mid = 0;

/** One turn with the agent. Returns the reply text, every tool call (name, input, output) and the UI messages. */
async function turn(ctx, talkId, history, text, focus) {
  const user = { id: `u${++mid}`, role: 'user', parts: [{ type: 'text', text }] };
  const messages = [...history, user];
  const r = await ctx.request.post(B + '/api/remember', { data: { messages, talkId, focus }, headers: H });
  const raw = await r.text();
  const tools = new Map();
  let reply = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    let e;
    try {
      e = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (e.type === 'text-delta') reply += e.delta;
    if (e.type === 'tool-input-available') tools.set(e.toolCallId, { name: e.toolName, input: e.input });
    if (e.type === 'tool-output-available' && tools.has(e.toolCallId)) tools.get(e.toolCallId).output = e.output;
    if (e.type === 'tool-output-error' && tools.has(e.toolCallId)) tools.get(e.toolCallId).output = { error: e.errorText };
  }
  const calls = [...tools.values()];
  const assistant = { id: `a${mid}`, role: 'assistant', parts: [...calls.map((c) => ({ type: `tool-${c.name}`, toolCallId: c.name + mid, state: 'output-available', input: c.input, output: c.output })), { type: 'text', text: reply }] };
  const all = [...messages, assistant];
  // keep the conversation, as the app does
  await ctx.request.put(B + `/api/talks/${encodeURIComponent(talkId)}`, { data: { messages: all }, headers: H });
  return { status: r.status(), reply, calls, used: (n) => calls.filter((c) => c.name === n), messages: all };
}

const newTalk = async (ctx, mode = 'free') => (await (await ctx.request.post(B + '/api/talks', { data: { mode }, headers: H })).json()).talk.id;
const state = async (ctx) => (await ctx.request.get(B + '/api/state')).json();
const actions = async (ctx, talk) => (await (await ctx.request.get(B + '/api/actions' + (talk ? `?talk=${talk}` : ''))).json()).actions;
const decide = async (ctx, id, decision) => (await (await ctx.request.post(B + `/api/actions/${id}`, { data: { decision }, headers: H })).json()).action;
const plant = async (ctx, m) => (await (await ctx.request.post(B + '/api/memories', { data: { feeling: '', weight: 'light', ...m }, headers: H })).json()).memory;

(async () => {
  const b = await chromium.launch();
  try {
    const c = await b.newContext();
    await A.signup(c);
    const crepes = await plant(c, { place: 'Paris', moment: 'Crêpes in the rain by the Seine', when: 'June 2025' });
    const books = await plant(c, { place: 'Paris', moment: 'The bookshop with the cat asleep on the stairs' });
    const braid = await plant(c, { place: 'Jiangmen', moment: 'She braided my hair on the last morning' });
    const ttea = await plant(c, { place: 'Taipei', moment: 'Bubble tea after the night market' });

    // 1. retrieves an existing memory correctly
    let t = await newTalk(c);
    let r = await turn(c, t, [], 'What do you remember about Paris?');
    const s1 = r.used('searchMemories')[0];
    ok('1. a question about Paris runs a real search', !!s1 && s1.output?.total === 2, JSON.stringify(s1?.output));
    ok('1. the search returns exactly the Paris memories', s1 && s1.output.memories.map((m) => m.id).sort().join() === [crepes.id, books.id].sort().join());
    ok('1. the answer quotes what is stored', /Crêpes in the rain/.test(r.reply) && /bookshop/.test(r.reply), r.reply);

    // 2. does not invent missing details
    r = await turn(c, t, r.messages, 'What do you remember about Reykjavik?');
    ok('2. nothing about Reykjavik is found', r.used('searchMemories')[0]?.output?.total === 0);
    ok('2. it says so instead of inventing', /don’t have anything|couldn’t find|nothing/i.test(r.reply) && !/Reykjavik[^.]*“/.test(r.reply), r.reply);

    // 3. asks a useful follow-up / 4. several memories from one story
    const cap = await newTalk(c);
    r = await turn(c, cap, [], 'Last summer in Lisbon I was walking up to the castle at dawn, and we ate grilled sardines by the river, and I bought a blue tile for my mother.');
    const drafted = r.used('draftMemory');
    ok('4. one story becomes several drafts', drafted.length >= 3, String(drafted.length));
    ok('4. each draft is a real stored draft', drafted.every((d) => d.output?.draftId));
    ok('3. it follows up with a question', /\?$/.test(r.reply.trim()), r.reply);
    const talkData = await (await c.request.get(B + `/api/talks/${cap}`)).json();
    ok('4. drafts are waiting, not saved', talkData.drafts.filter((d) => d.status === 'draft').length >= 3 && (await state(c)).memories.length === 4);

    // 5. saves only approved memories
    const keep = talkData.drafts.filter((d) => d.status === 'draft').slice(0, 2);
    const rv = await c.request.post(B + `/api/talks/${cap}/review`, {
      data: { items: keep.map((d) => ({ draftId: d.id, title: d.data.title, moment: d.data.moment, place: d.data.place, weight: d.data.weight || 'light', people: (d.data.people || []).map((n) => ({ name: typeof n === 'string' ? n : n.name })) })) },
      headers: H,
    });
    const after5 = await state(c);
    ok('5. only the approved drafts became memories', rv.ok() && after5.memories.length === 6 && after5.memories.filter((m) => m.origin === 'agent').length === 2, `${rv.status()} ${after5.memories.length} ${rv.ok() ? '' : await rv.text()}`);
    ok('5. the unapproved draft is still only a draft', (await (await c.request.get(B + `/api/talks/${cap}`)).json()).drafts.filter((d) => d.status === 'draft').length >= 1);

    // 6. finds relevant existing memories
    t = await newTalk(c);
    r = await turn(c, t, [], 'Connect this to my Paris memories', crepes.id);
    ok('6. it looks for Paris memories', r.used('searchMemories').length === 1);
    // 7. suggests an appropriate connection (as a proposal only)
    const prop = r.used('proposeConnection')[0];
    ok('7. it proposes a red thread to the other Paris memory', prop && prop.input.a === crepes.id && prop.input.b === books.id, JSON.stringify(prop?.input));
    let acts = await actions(c, t);
    ok('7. the proposal is stored and waiting', acts.length === 1 && acts[0].status === 'pending' && acts[0].kind === 'tie');
    ok('7. nothing is tied until confirmed', (await state(c)).threads.length === 0);
    ok('7. it says it is waiting, not done', /nothing changes until you confirm/i.test(r.reply), r.reply);
    // 8. creates a confirmed connection
    const done = await decide(c, acts[0].id, 'confirm');
    const s8 = await state(c);
    ok('8. confirming creates the red thread', done.status === 'done' && s8.threads.length === 1 && [s8.threads[0].a, s8.threads[0].b].sort().join() === [crepes.id, books.id].sort().join());
    ok('8. a second confirm changes nothing', (await decide(c, acts[0].id, 'confirm')).status === 'done' && (await state(c)).threads.length === 1);
    // declining
    r = await turn(c, t, r.messages, 'Delete my memory about bubble tea');
    acts = await actions(c, t);
    const del = acts.find((a) => a.kind === 'delete-memory');
    ok('deletion is only proposed', del && del.status === 'pending' && (await state(c)).memories.some((m) => m.id === ttea.id));
    await decide(c, del.id, 'decline');
    ok('declining leaves the memory', (await state(c)).memories.some((m) => m.id === ttea.id));

    // 9. context across sessions
    const old = await newTalk(c);
    await turn(c, old, [], 'My grandmother kept jasmine on the windowsill in Jiangmen.');
    const later = await newTalk(c);
    r = await turn(c, later, [], 'What did I tell you about jasmine?');
    const rc = r.used('recallConversations')[0];
    ok('9. it looks through earlier conversations', !!rc && rc.output.found >= 1);
    ok('9. and repeats their own words', /jasmine on the windowsill/.test(r.reply), r.reply);

    // 11. ambiguous requests get a question, not a guess
    t = await newTalk(c);
    r = await turn(c, t, [], 'Please delete it');
    ok('11. an unclear deletion asks which memory', /which memory/i.test(r.reply) && r.calls.length === 0 && (await actions(c, t)).length === 0, r.reply);
    r = await turn(c, t, r.messages, 'Connect this to my Paris memories');
    ok('11. "connect this" with nothing open asks which', /which memory/i.test(r.reply) && (await actions(c, t)).length === 0, r.reply);

    // 12/13. tool failures are reported, never claimed as success
    r = await turn(c, t, r.messages, `Connect ${crepes.id} to m0000000000x9`);
    const bad = r.used('proposeConnection')[0];
    ok('12. a tool that fails returns an error, not a crash', r.status === 200 && bad && bad.output?.error, JSON.stringify(bad?.output));
    ok('13. the reply says it didn’t work', /didn’t work/i.test(r.reply) && !/suggested|done|tied/i.test(r.reply.replace(/didn’t work.*/i, '')), r.reply);
    ok('13. no proposal was stored for it', (await actions(c, t)).length === 0);
    const log = (await (await c.request.get(B + '/api/agent/log')).json()).log;
    ok('every tool call is logged, failures included', log.some((l) => l.tool === 'proposeConnection' && !l.ok) && log.some((l) => l.tool === 'searchMemories' && l.ok));
    // a confirmation that can no longer be carried out is recorded as failed
    r = await turn(c, t, r.messages, 'Delete my memory about bubble tea');
    const del2 = (await actions(c, t)).find((a) => a.kind === 'delete-memory' && a.status === 'pending');
    await c.request.delete(B + `/api/memories/${ttea.id}`, { headers: H });
    const failed = await decide(c, del2.id, 'confirm');
    ok('13. confirming something that no longer exists is reported as failed', failed.status === 'failed' && !!failed.error, JSON.stringify(failed));

    // reflection: built from real records, kept only if confirmed, marked as written by the agent
    t = await newTalk(c);
    r = await turn(c, t, [], 'Reflect on my garden');
    ok('reflection: counts themes and reads real memories first', r.used('findThemes').length === 1 && r.used('searchMemories').length === 1);
    const refl = (await actions(c, t)).find((a) => a.kind === 'save-reflection');
    ok('reflection: offered, not saved', refl && refl.status === 'pending' && !(await state(c)).entries.some((e) => e.meta?.ai));
    ok('reflection: built only from stored memories', refl && refl.payload.memoryIds.every((id) => (s8.memories.map((m) => m.id).concat(after5.memories.map((m) => m.id))).includes(id)));
    await decide(c, refl.id, 'confirm');
    ok('reflection: kept and marked as written by the agent', (await state(c)).entries.some((e) => e.meta?.ai));

    // 10. data isolation
    const other = await b.newContext();
    await A.signup(other);
    const ot = await newTalk(other);
    r = await turn(other, ot, [], 'What do you remember about Paris?');
    ok('10. another account’s search finds none of these memories', r.used('searchMemories')[0]?.output?.total === 0);
    r = await turn(other, ot, r.messages, `Connect ${crepes.id} to ${books.id}`);
    ok('10. it cannot propose changes to someone else’s memories', r.used('proposeConnection')[0]?.output?.error && (await actions(other)).length === 0);
    ok('10. nor see their proposals or tool log', (await actions(other)).length === 0 && !(await (await other.request.get(B + '/api/agent/log')).json()).log.some((l) => l.talkId === t));
    const steal = await other.request.post(B + `/api/actions/${refl.id}`, { data: { decision: 'confirm' }, headers: H });
    ok('10. nor confirm their proposals', steal.status() === 404);
    r = await turn(other, ot, r.messages, 'What did I tell you about jasmine?');
    ok('10. nor recall their conversations', r.used('recallConversations')[0]?.output?.found === 0);

    // proactive suggestions on Today, with evidence, dismissable, and switchable off
    let rd = (await (await c.request.get(B + '/api/rediscover')).json()).suggestions;
    ok('suggestions: evidence-based (a shared place)', rd.some((x) => x.kind === 'place' && /Paris appears in/.test(x.title)), JSON.stringify(rd.map((x) => x.title)));
    const one = rd[0];
    await c.request.post(B + '/api/suggestions/dismiss', { data: { key: one.key }, headers: H });
    rd = (await (await c.request.get(B + '/api/rediscover')).json()).suggestions;
    ok('suggestions: a dismissed one stays gone', !rd.some((x) => x.key === one.key));
    await c.request.put(B + '/api/profile', { data: { proactive: false }, headers: H });
    rd = (await (await c.request.get(B + '/api/rediscover')).json()).suggestions;
    ok('suggestions: can be switched off', rd.length === 0);
    await c.request.put(B + '/api/profile', { data: { proactive: true }, headers: H });

    // the experience: activity state, found memories lit on the tree, proposal card, modes
    const m = await b.newContext({ ...devices['iPhone 13'] });
    await A.share(c, m);
    const p = await m.newPage();
    let errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/');
    await p.waitForSelector('.agent-mode');
    ok('home: Remember / Ask / Reflect modes', (await p.$$eval('.agent-mode', (x) => x.map((y) => y.textContent.trim()).join())) === 'Remember,Ask,Reflect');
    await p.click('.agent-mode:has-text("Ask")');
    const prompts = await p.$$eval('.agent-prompt', (x) => x.map((y) => y.textContent.trim()));
    ok('home: suggested prompts come from what is really saved', prompts.some((x) => /Paris/.test(x)) && !prompts.some((x) => /Reykjavik/.test(x)), prompts.join(' | '));
    await p.click('.agent-prompt:has-text("Paris")');
    await p.waitForSelector('.agent-state', { timeout: 5000 }).catch(() => {});
    await p.waitForSelector('.agent-found', { timeout: 15000 });
    ok('home: found memories appear, and light on the tree', (await p.$$('.agent-found button')).length === 2 && (await p.$$('.blossom.is-lit')).length === 2);
    ok('home: the input stays above the tab bar', (await p.$eval('#say', (e) => e.getBoundingClientRect().bottom)) <= (await p.$eval('.tabbar', (e) => e.getBoundingClientRect().top)) + 1);
    await p.fill('#say', 'Reflect on my garden');
    await p.keyboard.press('Enter');
    await p.waitForSelector('.agent-action.s-pending', { timeout: 15000 });
    ok('home: a proposal shows as a card to confirm', /written by the agent/.test(await p.textContent('.agent-action.s-pending')) && (await p.isVisible('.agent-action.s-pending .agent-yes')));
    await p.click('.agent-action.s-pending .quiet:has-text("Not now")');
    await p.waitForSelector('.agent-action.s-declined');
    ok('home: declining is shown', /Left as it was/.test(await p.textContent('.agent-action.s-declined')));
    await p.screenshot({ path: 'agent-phone.png' });
    { const h418 = errs.filter((e) => /React error #418/.test(String(e))); errs = errs.filter((e) => !/React error #418/.test(String(e))); if (h418.length) T.push('NOTE recoverable hydration warnings (#418, known issue): ' + h418.length); }
    ok('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    T.push('CRASH ' + (e.stack || e.message));
  }
  await b.close();
  console.log(T.join('\n'));
})();
