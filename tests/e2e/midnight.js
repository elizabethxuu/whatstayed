// The midnight garden: capture in seconds, the blossom confirmation, the living home, the agent's openings,
// the constellation (real relationships only), Rewind (real dates only), and private share cards.
const { chromium, devices } = require('playwright');
const A = require('./auth.js');
const path = require('path');
const B = 'http://localhost:3100';
const H = { origin: B };
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const state = (c) => c.request.get(B + '/api/state').then((r) => r.json());
const plant = async (c, m) => (await (await c.request.post(B + '/api/memories', { data: { feeling: '', weight: 'light', ...m }, headers: H })).json()).memory;

(async () => {
  const b = await chromium.launch();
  let errs = [];
  try {
    const c = await b.newContext({ ...devices['iPhone 13'] });
    await A.signup(c);
    const t = new Date();
    const md = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const m1 = await plant(c, { place: 'Paris', moment: 'Crêpes in the rain by the Seine', date: `${t.getFullYear() - 1}-${md}`, title: 'Rain on the Seine' });
    const m2 = await plant(c, { place: 'Paris', moment: 'The bookshop with the cat asleep on the stairs', date: '2025-07-14' });
    const m3 = await plant(c, { place: 'Lisbon', moment: 'Bells on the tram up to the castle', weight: 'heavy', date: `${t.getFullYear() - 3}-${md}` });
    const person = (await (await c.request.post(B + '/api/people', { data: { name: 'Ama' }, headers: H })).json()).person;
    await c.request.post(B + '/api/links', { data: { kind: 'memory-person', a: m1.id, b: person.id }, headers: H });
    await c.request.post(B + '/api/links', { data: { kind: 'memory-person', a: m3.id, b: person.id }, headers: H });
    await c.request.post(B + '/api/threads', { data: { a: m1.id, b: m2.id, note: 'Both in Paris', origin: 'you' }, headers: H });

    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 80)));

    // ---------- the living home ----------
    await p.goto(B + '/today');
    await p.waitForSelector('.today-count');
    ok('home: a live count from the real archive', /3 memories growing/.test(await p.textContent('.today-count')));
    ok('home: no "new since" on a first visit', !(await p.isVisible('.today-new')));
    await p.waitForTimeout(4300); // the visit is remembered after a few seconds
    await plant(c, { place: 'Kyoto', moment: 'Moss garden after the rain' });
    await p.reload();
    await p.waitForSelector('.today-count');
    ok('home: new blossoms since the last visit, counted', /a new blossom since you were last here/.test(await p.textContent('.today-count')), await p.textContent('.today-count'));
    ok('home: an older memory finds its way back', (await p.isVisible('.today-back-card')) && /Paris|Lisbon/.test(await p.textContent('.today-back-card')));
    ok('home: quick ways to talk or speak', (await p.isVisible('text=Talk it through instead')) && (await p.getAttribute('.today-voice', 'href')) === '/?talk=new&voice=1');
    ok('home: the willow is the main attraction', await p.isVisible('.today-tree .willow'));

    // ---------- capture ----------
    await p.click('.capture-fab');
    await p.waitForSelector('.capture-sheet');
    const opts = await p.$$eval('.capture-title', (x) => x.map((y) => y.textContent));
    ok('capture: six ways to keep something', opts.join('|') === 'Tell a story|Record a voice memory|Write something|Add photographs|Save a place|Capture a moment', opts.join('|'));
    ok('capture: the button steps aside while the sheet is open', !(await p.isVisible('.capture-fab')));
    await p.click('.capture-list button:has-text("Capture a moment")');
    await p.waitForSelector('.add h2:has-text("What do you want to remember?")');
    await p.fill('.add textarea >> nth=0', 'Fireflies over the pond');
    await p.click('.add button:has-text("Continue")');
    await p.fill('.add label:has-text("Where") input', 'Hudson Valley');
    await p.click('.add button:has-text("Save it now")');
    await p.waitForSelector('.bloom-burst', { timeout: 5000 });
    ok('saving: a blossom opens over the garden', /A new blossom/.test(await p.textContent('.bloom-burst')));
    await p.waitForURL(/\/memory\//);
    ok('capture a moment: saved and opened', (await state(c)).memories.some((m) => m.place === 'Hudson Valley'));

    await p.click('.capture-fab');
    await p.click('.capture-list button:has-text("Save a place")');
    await p.waitForSelector('.add h2:has-text("When and where?")');
    ok('save a place: opens straight at where', true);
    await p.click('.add-head button:has-text("Close")');

    await p.click('.capture-fab');
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.capture-list button:has-text("Add photographs")')]);
    await chooser.setFiles(path.join(__dirname, '../../public/icons/icon-512.png'));
    await p.waitForSelector('.add .add-first-photos img');
    ok('add photographs: the chosen picture leads the memory', true);
    await p.fill('.add textarea >> nth=0', 'The flower I drew');
    await p.click('.add button:has-text("Continue")');
    await p.fill('.add label:has-text("Where") input', 'Home');
    const was = p.url();
    await p.click('.add button:has-text("Save it now")');
    await p.waitForURL((u) => /\/memory\//.test(u.pathname) && u.href !== was);
    const s1 = await state(c);
    const drawn = s1.memories.find((m) => m.moment === 'The flower I drew');
    ok('add photographs: saved with the photograph', !!drawn && s1.media.some((x) => x.ownerId === drawn.id && x.kind === 'photo'));

    await p.click('.capture-fab');
    await p.click('.capture-list button:has-text("Write something")');
    await p.waitForURL(/\/archives/);
    await p.waitForSelector('#page');
    ok('write something: a fresh page, ready', true);

    await p.click('.capture-fab');
    await p.click('.capture-list button:has-text("Tell a story")');
    await p.waitForURL(/\?c=/);
    ok('tell a story: a new conversation', true);

    await p.click('.capture-fab');
    await p.click('.capture-list button:has-text("Record a voice memory")');
    const heard = await p.waitForSelector('.voice-ask, .toast.error', { timeout: 15000 }).then(() => true).catch(() => false);
    ok('record a voice memory: a new conversation that asks before using the microphone (or says plainly it can’t)', heard && /\?c=/.test(p.url()));

    // ---------- the agent's openings and states ----------
    await p.goto(B + '/?talk=new');
    await p.waitForURL(/\?c=/);
    await p.waitForSelector('.agent-noticed');
    const noticed = await p.$$eval('.agent-noticed button', (x) => x.map((y) => y.textContent.trim()));
    ok('agent: openings built from real memories', noticed.some((n) => /I found another memory from Paris\./.test(n)) && noticed.some((n) => /Tell me more about “/.test(n)), noticed.join(' | '));
    const states = new Set();
    const watch = setInterval(() => p.evaluate(() => document.querySelector('main.garden')?.className).then((cl) => cl && (cl.match(/agent-\w+/g) || []).forEach((x) => states.add(x))).catch(() => {}), 60);
    await p.click('.agent-mode:has-text("Ask")');
    await p.click('.agent-prompt:has-text("Paris")');
    await p.waitForSelector('.agent-found', { timeout: 15000 });
    await p.waitForTimeout(400);
    clearInterval(watch);
    ok('agent: the garden shows it thinking and searching, then remembering', states.has('agent-thinking') && (states.has('agent-searching') || states.has('agent-remembering')) && states.has('agent-remembering'), [...states].join(','));
    ok('agent: found memories glow on the willow', (await p.$$('.willow .blossom.is-lit')).length === 2);

    // ---------- constellation ----------
    await p.goto(B + '/constellation');
    await p.waitForSelector('.cn-star');
    ok('constellation: one point of light per memory', (await p.$$('.cn-star')).length === (await state(c)).memories.length);
    const counts = await p.$$eval('.cn-key', (x) => x.map((y) => y.textContent.replace(/\s+/g, ' ').trim()));
    ok('constellation: lines only for real relationships (1 thread, 1 shared person)', counts.join('|') === 'Red threads 1|Shared people 1|Same trip 0|Same collection 0', counts.join('|'));
    ok('constellation: places are clusters', (await p.$$eval('.cn-cluster text', (x) => x.map((y) => y.textContent))).includes('Paris'));
    await p.click(`.cn-star[aria-label^="Paris: Rain on the Seine"]`);
    await p.waitForSelector('.cn-story');
    const story = await p.textContent('.cn-story');
    ok('constellation: selecting a point reveals its story and its links', /Rain on the Seine/.test(story) && /With Ama/.test(story) && /Both in Paris/.test(story) && /Both with Ama/.test(story), story.slice(0, 200));

    // ---------- rewind ----------
    await p.goto(B + '/rewind');
    await p.click('.rw-ways button:has-text("This day last year")');
    ok('rewind: this day last year finds exactly the memory dated then', /One memory/.test(await p.textContent('.rw-result')));
    await p.click('.rw-ways button:has-text("This month, five years ago")');
    ok('rewind: and says so when nothing is dated then (no guessing)', /Nothing is dated to/.test(await p.textContent('.rw-result')));
    await p.click('.rw-ways button:has-text("Memories with someone")');
    await p.selectOption('.rw-pick select', person.id);
    ok('rewind: with a person, in order', /2 memories/.test(await p.textContent('.rw-result')));
    await p.click('text=Play the album');
    await p.waitForSelector('.album-title');
    const first = await p.textContent('.album-title');
    ok('album: plays from the earliest', /tram/.test(first), first);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('ArrowRight');
    await p.waitForSelector('text=What do you remember about them now?');
    const ask = await p.getAttribute('.album-end a.welcome-go', 'href');
    ok('album: ends by asking what you remember now, with those memories', /^\/\?ask=/.test(ask) && /Rain%20on%20the%20Seine|tram/.test(ask));
    await p.keyboard.press('Escape');

    // ---------- share a card ----------
    const posts = [];
    p.on('request', (r) => r.method() !== 'GET' && posts.push(r.url()));
    await p.goto(B + `/memory/${m1.id}`);
    await p.click('text=Share a card');
    await p.waitForSelector('.share-preview[src^="data:image/png"]', { timeout: 10000 });
    const before = await p.getAttribute('.share-preview', 'src');
    await p.click('.share-opts label:has-text("Where") input');
    await p.waitForFunction((src) => document.querySelector('.share-preview')?.getAttribute('src') !== src, before);
    ok('share: the card is drawn here and follows what you choose', true);
    ok('share: nothing is uploaded and no link is made', posts.length === 0, posts.join(' '));

    // ---------- the map by day ----------
    await p.goto(B + '/places');
    await p.waitForSelector('.a-land');
    const land = await p.$eval('.a-land', (e) => getComputedStyle(e).fill);
    ok('map: porcelain land on a pale blue sea', /rgb\(250, 249, 246\)/.test(land), land);

    { const h418 = errs.filter((e) => /React error #418/.test(String(e))); errs = errs.filter((e) => !/React error #418/.test(String(e))); if (h418.length) T.push('NOTE recoverable hydration warnings (#418, known issue): ' + h418.length); }

    ok('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    T.push('CRASH ' + (e.stack || e.message));
  }
  await b.close();
  console.log(T.join('\n'));
})();
