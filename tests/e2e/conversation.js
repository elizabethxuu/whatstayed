// The conversational memory agent: the 14 acceptance steps, plus trip mode, corrections, connections,
// voice input, failures and retry, conversation history, rate limits, and phones.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100';
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const EDI = [{ lat: '55.9533', lon: '-3.1883', name: 'Edinburgh', display_name: 'Edinburgh, Scotland, United Kingdom', address: { city: 'Edinburgh', state: 'Scotland', country: 'United Kingdom' } }];
const PAR = [{ lat: '48.8566', lon: '2.3522', name: 'Paris', display_name: 'Paris, France', address: { city: 'Paris', country: 'France' } }];
async function routes(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await ctx.route('https://nominatim.openstreetmap.org/**', (r) => {
    const q = (new URL(r.request().url()).searchParams.get('q') || '').toLowerCase();
    r.fulfill({ json: q.includes('edinburgh') ? EDI : q.includes('paris') || q.includes('france') ? PAR : [] });
  });
}
// a stand-in for the browser's speech recognition, so voice input can be tested headlessly
const fakeSpeech = () => {
  class FakeRec {
    start() {
      setTimeout(() => {
        const res = [Object.assign([{ transcript: 'I want to remember my summer in France' }], { isFinal: true })];
        if (this.onresult) this.onresult({ resultIndex: 0, results: res });
        if (this.onend) this.onend();
      }, 400);
    }
    stop() { if (this.onend) this.onend(); }
    abort() {}
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
};

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await routes(c);
  await c.addInitScript(fakeSpeech);
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const idle = async () => {
    await p.waitForFunction(() => !document.querySelector('.garden.listening'), null, { timeout: 20000 });
    await p.waitForTimeout(1300);
  };
  const say = async (t) => {
    await p.fill('#say', t);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    await idle();
  };
  const state = () => p.evaluate(async () => (await fetch('/api/state')).json());

  // 1. open What Stayed (a fresh account), with one memory already in Edinburgh
  await p.goto(B + '/welcome');
  await p.click('text=Begin your story'); await p.click('text=Skip for now');
  await p.fill('input[type=email]', 'talker@example.com');
  await p.fill('input[type=password]', 'garden-talk-1');
  await p.click('button[type=submit]');
  await p.click('text=Enter your garden'); await p.waitForURL(/\/today/); await p.goto(B + '/');
  ok('1. opens on an inviting, empty garden', await p.isVisible('text=Add a memory'));
  await p.evaluate(() =>
    fetch('/api/memories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ place: 'Edinburgh', moment: 'Fireworks over the castle at Hogmanay', feeling: 'bright', weight: 'light' }) }),
  );

  // 2. start a conversation about a trip
  await p.goto(B + '/');
  await p.click('text=Tell it about a trip');
  await p.waitForURL(/\?c=/);
  await p.waitForSelector('text=Where did you go?');
  ok('2. a trip conversation begins with a question, not a form', await p.isVisible('text=Where did you go?'));

  // 3. describe the trip naturally
  await say('I went to Edinburgh last October. I remember walking through the old streets in the rain, finding a tiny bookstore, and spending the afternoon in a café.');
  let s = await state();
  const talk = s.talks[0];
  ok('the trip is named from what was said', /Edinburgh, October/.test(talk.title), talk.title);
  // 4. the agent follows up
  ok('4. the agent asks a follow-up question', /\?/.test(await p.textContent('.voice-line')), await p.textContent('.voice-line'));
  // 6. several distinct memories are drafted from one story — and none are saved yet
  ok('6. three distinct memories drafted from one message', talk.drafts === 3, JSON.stringify(talk));
  ok('nothing reaches the garden before review', s.memories.length === 1);
  ok('drafts show as closed buds on the tree, not blossoms', (await p.$$('.bud-draft')).length === 3 && (await p.$$('.blossom')).length === 1);
  ok('a quiet “Review 3 memories” appears', await p.isVisible('button.review-go:has-text("Review 3 memories")'));
  ok('the conversation is labelled with its trip', /Trip · Edinburgh, October/.test(await p.textContent('.talk-name')));

  // 5. answer in their own words; a correction updates a draft instead of adding one
  await say('I don’t remember the name, but it was small and had old wooden shelves. I bought a book there with Mei.');
  await say('Actually, I bought two old books there with Mei.');
  s = await state();
  const t1 = s.talks.find((t) => t.id === talk.id);
  ok('5. answering adds a draft; a correction replaces it', t1.drafts === 4, JSON.stringify(t1));
  await say('That’s all.');
  ok('the agent says the memories are ready to review', /ready to review/.test(await p.textContent('.voice-line')));

  // 13. the conversation and its drafts persist after refresh
  await p.reload();
  await p.waitForSelector('.review-go');
  ok('13. after refresh: the conversation, its trip name and 4 drafts are still here', /Review 4 memories/.test(await p.textContent('.review-go')) && /That’s all/.test(await p.textContent('.you')));
  await p.click('text=The conversation');
  ok('the transcript shows what was drafted', (await p.$$('.log-planted')).length >= 4);
  await p.click('text=Hide the conversation');

  // 7. review and edit
  await p.click('.review-go');
  await p.waitForSelector('.review');
  await p.waitForFunction(() => ![...document.querySelectorAll('.rv-loc')].some((e) => /Finding/.test(e.textContent)), null, { timeout: 15000 });
  const items = await p.$$('.rv-item');
  ok('7. the review lists every draft', items.length === 4);
  ok('uncertain dates are marked “not sure”', (await p.$$('.rv-item .unsure')).length >= 3);
  ok('places are found on the map for review', /Edinburgh, United Kingdom/.test(await p.textContent('.rv-item:nth-child(1) .rv-loc')));
  ok('Mei is proposed as a new person', /Mei · new/.test(await p.textContent('.rv-item:nth-child(4)')));
  ok('a connection is suggested, not made', /Might connect to/.test(await p.textContent('.rv-item:nth-child(1)')) && /Fireworks/.test(await p.textContent('.rv-item:nth-child(1) .rv-suggest')));
  await p.fill('.rv-item:nth-child(1) .rv-t input', 'Old Town in the rain');
  await p.click('.rv-item:nth-child(1) .rv-suggest button:has-text("Tie a red thread")');
  await p.fill('.rv-item:nth-child(1) .rv-s-note input', 'Both in Edinburgh');
  await p.click('.rv-item:nth-child(3) .rv-keep input'); // leave the café for later
  await p.fill('.rv-item:nth-child(2) .rv-t input', '');
  await p.screenshot({ path: __dirname + '/out/conv-review.png', fullPage: true });
  await p.click('.rv-foot .welcome-go');
  ok('validation: a blank title is caught before saving', /Give it a title/.test(await p.textContent('.rv-item:nth-child(2)')));
  await p.fill('.rv-item:nth-child(2) .rv-t input', 'The tiny bookstore');
  const trip = await p.inputValue('.rv-trip textarea');
  ok('the trip page is prefilled with their own words', /walking through the old streets/.test(trip) && !/That’s all/.test(trip));

  // 8. confirm the selected memories
  await p.click('.rv-foot .welcome-go');
  await p.waitForSelector('.rv-item.saved', { timeout: 15000 });
  ok('8. three selected memories saved', (await p.$$('.rv-item.saved')).length === 3);
  // photographs can be added straight away
  const jpg = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 600, 400); return c.toDataURL('image/jpeg').split(',')[1]; });
  await p.setInputFiles('.rv-item.saved:nth-child(1) input[type=file][accept="image/*"]', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg, 'base64') });
  await p.waitForSelector('.rv-item.saved:nth-child(1) .shelf-photos img', { timeout: 10000 });
  ok('a photograph can be attached in the review', true);
  await p.click('.review button:has-text("Done")');
  await p.waitForTimeout(1500);

  // 9 + 10. persisted, and each saved memory is a blossom
  s = await state();
  ok('9. saved persistently (4 memories: 1 earlier + 3 new)', s.memories.length === 4);
  ok('10. each saved memory is a blossom; the unsaved draft is still a bud', (await p.$$('.blossom')).length === 4 && (await p.$$('.bud-draft')).length === 1);
  const saved = s.memories.filter((m) => m.extra?.from === 'conversation');
  ok('confirmed facts kept: titles, trip, people, details', saved.some((m) => m.extra.title === 'Old Town in the rain') && saved.every((m) => m.extra.trip?.title) && s.people.some((x) => x.name === 'Mei'));
  ok('the accepted connection became a red thread with its reason', s.threads.length === 1 && s.threads[0].note === 'Both in Edinburgh');
  ok('the blossom shows marks for photo / place / thread', (await p.$$('.mk-photo')).length >= 1 && (await p.$$('.mk-place')).length >= 3 && (await p.$$('.mk-linked')).length === 2);

  // 11. they appear in Archives, Places, Timeline (and as a collection)
  ok('11a. Places: pinned in Edinburgh', Object.values(s.locations).filter((l) => l.city === 'Edinburgh' && l.lat).length === 3);
  ok('11b. Archives: the trip is a page, tied to its memories', s.entries.some((e) => /^Edinburgh, October/.test(e.body)) && s.links.filter((l) => l.kind === 'entry-memory').length === 3);
  ok('11c. a collection holds the trip', s.collections.some((x) => /Edinburgh, October/.test(x.name)) && s.collectionItems.length === 4);
  await p.goto(B + '/timeline');
  await p.waitForTimeout(1200);
  const tl = await p.textContent('main');
  ok('11d. Timeline: placed in October, not on an invented day', /Old Town in the rain/.test(tl) && /October/.test(tl) && !/October 1\b/.test(tl));
  await p.goto(B + '/places');
  await p.waitForTimeout(1500);
  ok('Places shows Edinburgh on the map', /Edinburgh/.test(await p.textContent('main')) && (await p.$$('.a-mark')).length >= 1);

  // 12. reopen and edit a memory
  await p.goto(B + '/');
  await p.waitForSelector('.blossom');
  const target = saved.find((m) => m.extra.title === 'Old Town in the rain');
  await p.goto(B + '/?m=' + target.id);
  await p.waitForSelector('.card');
  ok('12. the memory card shows title and trip', /Old Town in the rain/.test(await p.textContent('.card')) && /Edinburgh, October/.test(await p.textContent('.card')));
  await p.click('.card >> text=Edit');
  await p.fill('.mem-ed input[placeholder="The night market"]', 'The Old Town, raining');
  await p.click('.mem-ed button[type=submit]');
  await p.waitForTimeout(800);
  await p.reload();
  await p.goto(B + '/?m=' + target.id);
  await p.waitForSelector('.card');
  ok('12. the edit persists', /The Old Town, raining/.test(await p.textContent('.card')));

  // discarding the leftover draft
  await p.goto(B + '/?c=' + talk.id);
  await p.click('.review-go');
  await p.waitForSelector('.review');
  await p.click('.rv-foot >> text=Discard the draft');
  await p.click('.confirm-yes');
  await p.waitForTimeout(1000);
  ok('the remaining draft can be discarded', (await p.$$('.bud-draft')).length === 0 && !(await p.isVisible('.review-go')));

  // voice input: only on request, explained first, reviewed before sending
  await p.goto(B + '/');
  await p.click('text=Conversations');
  await p.click('text=Start a new conversation');
  await p.waitForURL(/\?c=/);
  await p.waitForSelector('.say .mic');
  await p.click('.say .mic');
  ok('voice: explains before the microphone is asked for', /microphone/.test(await p.textContent('.voice-ask')) && /keeps no recording/.test(await p.textContent('.voice-ask')));
  await p.click('text=Start speaking');
  await p.waitForFunction(() => /summer in France/.test(document.querySelector('#say').value), null, { timeout: 5000 });
  ok('voice: speech lands in the writing line to review, not sent', (await p.inputValue('#say')) === 'I want to remember my summer in France' && !(await p.$('.you')));
  await p.fill('#say', 'I want to remember my summer in France, swimming in the river at Annecy with my brother.');
  await p.keyboard.press('Enter');
  await idle();
  ok('voice: the edited words are sent', /swimming in the river/.test(await p.textContent('.you')));

  // failure: no invented reply; retry works; writing by hand is offered
  await p.route('**/api/remember', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Something went wrong on our side.' }) }));
  await p.fill('#say', 'We ate peaches on the dock.');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.voice-fail', { timeout: 10000 });
  ok('failure: says so plainly, invents nothing', /didn’t come through/.test(await p.textContent('.voice-fail')) && (await p.isVisible('text=Write it yourself')));
  await p.unroute('**/api/remember');
  await p.click('.voice-fail >> text=Try again');
  await idle();
  ok('failure: “Try again” recovers the conversation', !(await p.isVisible('.voice-fail')));

  // conversation history: list, resume, delete (memories stay)
  await p.click('text=Conversations');
  const listed = await p.$$('.talks-list li');
  ok('history: both conversations listed', listed.length === 2);
  await p.click('.talks-list li >> text=Edinburgh, October');
  await p.waitForURL(new RegExp(talk.id));
  await p.waitForSelector('.you');
  ok('history: resuming shows where it left off', /That’s all/.test(await p.textContent('.you')));
  await p.click('text=Conversations');
  await p.click(`.talks-list li:has-text("Edinburgh, October") .untie`);
  await p.click('.confirm-yes');
  await p.waitForTimeout(1500);
  s = await state();
  ok('history: deleting a conversation keeps its saved memories', s.talks.length === 1 && s.memories.length === 4);

  // 13 (sign-in). sign out, sign back in: conversation history intact
  await p.goto(B + '/account');
  await p.click('text=Sign out');
  await p.waitForURL(/\/welcome/);
  await p.fill('input[type=email]', 'talker@example.com');
  await p.fill('input[type=password]', 'garden-talk-1');
  await p.click('button[type=submit]');
  await p.waitForURL(/\/today/); await p.goto(B + '/');
  await p.waitForSelector('.you');
  const v13 = await p.textContent('.voice');
  ok('13. after signing in again, the latest conversation is open', /peaches|swimming/.test(v13), v13 + ' | ' + p.url());
  ok('13. memories intact', (await p.$$('.blossom')).length === 5 || (await p.$$('.blossom')).length === 4);

  // isolation: someone else cannot read or use this conversation
  const c2 = await b.newContext();
  await routes(c2);
  const q = await c2.newPage();
  await q.goto(B + '/welcome');
  await q.click('text=Begin your story'); await q.click('text=Skip for now');
  await q.fill('input[type=email]', 'stranger@example.com');
  await q.fill('input[type=password]', 'stranger-garden-1');
  await q.click('button[type=submit]');
  await q.click('text=Enter your garden'); await q.waitForURL(/\/today/); await q.goto(B + '/');
  const mine = (await state()).talks[0].id;
  const iso = await q.evaluate(async (id) => {
    const a = (await fetch('/api/talks/' + id)).status;
    const b2 = (await fetch('/api/remember', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ talkId: id, messages: [{ id: 'x', role: 'user', parts: [{ type: 'text', text: 'hi there in Paris' }] }] }) })).status;
    const c3 = (await fetch('/api/talks/' + id + '/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) })).status;
    const d = (await fetch('/api/talks/' + id, { method: 'DELETE' })).status;
    return [a, b2, c3, d];
  }, mine);
  ok('another person can’t read, continue, review or delete this conversation', iso[0] === 404 && iso[1] === 404 && iso[2] >= 400 && iso[3] === 404, JSON.stringify(iso));

  // rate limits
  const rl = await q.evaluate(async () => {
    const t = await (await fetch('/api/talks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'free' }) })).json();
    let last = 0;
    for (let i = 0; i < 42; i++) {
      const r = await fetch('/api/remember', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ talkId: t.talk.id, messages: [{ id: 'u' + i, role: 'user', parts: [{ type: 'text', text: 'hello' }] }] }) });
      last = r.status;
      await r.text();
      if (r.status === 429) return { at: i, status: 429, msg: '' };
    }
    return { at: -1, status: last };
  });
  ok('the agent is rate-limited (40 replies / 10 min)', rl.status === 429 && rl.at === 40, JSON.stringify(rl));
  const lr = await q.evaluate(async () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'talker@example.com', password: 'wrong-' + i }) });
      codes.push(r.status);
    }
    return codes;
  });
  ok('failed sign-ins are limited (8 per email / 15 min)', lr.slice(0, 8).every((x) => x === 401) && lr[8] === 429, lr.join(','));

  // 14. on a phone
  const m = await b.newContext({ ...devices['iPhone 13'] });
  await routes(m);
  const mp = await m.newPage();
  await mp.goto(B + '/welcome');
  await mp.click('text=Begin your story'); await mp.click('text=Skip for now');
  await mp.fill('input[type=email]', 'phone@example.com');
  await mp.fill('input[type=password]', 'phone-garden-1');
  await mp.click('button[type=submit]');
  await mp.click('text=Enter your garden'); await mp.waitForURL(/\/today/); await mp.goto(B + '/');
  await mp.click('text=Tell it about a trip');
  await mp.waitForURL(/\?c=/);
  await mp.fill('#say', 'I went to Paris in June 2024. We spent the morning walking along the Seine, and then ate crêpes in the rain.');
  await mp.keyboard.press('Enter');
  await mp.waitForSelector('.review-go', { timeout: 20000 });
  await mp.waitForTimeout(800);
  const inputBottom = await mp.$eval('#say', (e) => e.getBoundingClientRect().bottom);
  const barTop = await mp.$eval('.tabbar', (e) => e.getBoundingClientRect().top);
  ok('14. phone: the writing line sits above the tab bar', inputBottom <= barTop, `${inputBottom} vs ${barTop}`);
  await mp.screenshot({ path: __dirname + '/out/conv-phone.png' });
  await mp.click('.review-go');
  await mp.waitForSelector('.review');
  await mp.waitForTimeout(2600);
  await mp.screenshot({ path: __dirname + '/out/conv-phone-review.png' });
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('14. phone: the review fits without sideways scrolling', over <= 0, String(over));
  await mp.click('.rv-foot .welcome-go');
  await mp.waitForSelector('.rv-item.saved', { timeout: 15000 });
  await mp.click('.review button:has-text("Done")');
  await mp.waitForTimeout(1500);
  ok('14. phone: saved from the review, blossoms on the tree', (await mp.$$('.blossom')).length === 2);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(T.join('\n'));
  console.log(`\n${T.filter((x) => x.startsWith('PASS')).length}/${T.length} passed`);
  await b.close();
})().catch((e) => {
  console.log(T.join('\n'));
  console.error('CRASH', e);
  process.exit(1);
});
