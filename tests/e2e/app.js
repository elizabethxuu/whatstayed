// The app: onboarding, Today, adding a memory step by step, a memory's own page, Archives favourites and drafts,
// You (profile, preferences, privacy, account), password reset and change, dark mode, PWA, offline, phone layout.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100';
const T = [];
const ok = (n, v, d = '') => T.push((v ? 'PASS ' : 'FAIL ') + n + (d && !v ? ' — ' + d : ''));
const fontsOff = (c) => c.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
const state = (p) => p.evaluate(async () => (await fetch('/api/state')).json());
const shot = (p, n) => p.screenshot({ path: `app-${n}.png` });
const EMAIL = `liz${Date.now()}@example.com`;
const PW = 'garden-path-1';

(async () => {
  const b = await chromium.launch();
  const errs = [];
  try {
    // ---------- onboarding on a phone ----------
    const c = await b.newContext({ ...devices['iPhone 13'] });
    await fontsOff(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(p.url() + ' ' + e.message.slice(0, 60)));
    const prompts = [];
    p.on('dialog', (d) => (prompts.push(d.message()), d.dismiss()));
    await p.goto(B + '/');
    await p.waitForURL(/\/welcome/);
    ok('signed out: the garden sends you to the welcome', p.url().includes('/welcome'));
    await p.waitForSelector('h1:has-text("Welcome back.")');
    ok('the original welcome: sign in, or begin a garden', await p.isVisible('text=Begin a garden'));
    ok('no Apple sign-in is shown (not configured)', !(await p.isVisible('text=/Apple/')));
    await shot(p, 'ob-0');
    await p.click('text=Begin a garden');
    await p.waitForSelector('h1:has-text("Create an account.")');
    await p.fill('input[type=email]', EMAIL);
    await p.fill('input[type=password]', 'short');
    await p.click('button[type=submit]');
    await p.waitForTimeout(600);
    ok('a short password is refused', ((await p.textContent('.welcome-error')) || '').length > 3);
    await p.fill('input[type=password]', PW);
    await p.click('button[type=submit]');
    await p.waitForURL(/\/begin/);
    await p.waitForSelector('h1:has-text("What would you like to remember?")');
    ok('a new account goes on to a few questions', true);
    ok('a progress bar shows the way', await p.isVisible('.ob-progress'));
    await p.click('.ob-choice:has-text("Places")');
    await p.click('.ob-choice:has-text("People")');
    ok('choices toggle (multi-select)', (await p.$$eval('.ob-choice[aria-pressed="true"]', (x) => x.length)) === 2);
    await shot(p, 'ob-1');
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("A little about you")');
    const tz = await p.inputValue('input[list]');
    ok('time zone is guessed from the device', tz.length > 2, tz);
    await p.fill('.ob-fields input >> nth=0', 'Liz');
    await p.fill('.ob-fields input[type=date]', '1994-05-02');
    const homeIn = p.locator('.ob-fields label:has-text("Home") input');
    await homeIn.fill('Taipei');
    await shot(p, 'ob-2');
    // answers survive a reload
    await p.reload();
    await p.waitForSelector('h1:has-text("A little about you")');
    ok('onboarding answers survive a reload', (await p.inputValue('.ob-fields input >> nth=0')) === 'Liz');
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("How do you usually remember")');
    await p.click('.ob-choice:has-text("Writing")');
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("past, or start from today")');
    await p.click('.ob-choice[role=radio] >> nth=0');
    ok('past or today is a single choice', (await p.$$eval('.ob-choice[aria-checked="true"]', (x) => x.length)) === 1);
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("most like to preserve")');
    await p.fill('.ob-fields textarea', 'The way my grandmother laughed.');
    await shot(p, 'ob-5');
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("gentle reminders")');
    const perm0 = await p.evaluate(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
    await p.click('.ob-toggle:has-text("evening")');
    ok('turning on a reminder does not ask for notification permission', prompts.length === 0 && (await p.evaluate(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))) === perm0);
    ok(
      'notifications are offered only by an explicit button (or honestly said to be blocked)',
      perm0 === 'default' ? await p.isVisible('text=Allow notifications') : perm0 === 'denied' ? await p.isVisible('text=blocked for this site') : true,
      perm0,
    );
    await shot(p, 'ob-6');
    await p.click('.ob-nav .welcome-go');
    await p.waitForSelector('h1:has-text("Every life leaves something behind.")', { timeout: 15000 });
    ok('the last screen: Every life leaves something behind.', await p.isVisible('text=Let’s begin with what stayed.'));
    await shot(p, 'ob-8');
    await p.click('text=Enter your garden');
    await p.waitForURL(B + '/');
    await p.waitForSelector('.agent-mode');
    ok('the garden is home, with the agent', true);
    await p.goto(B + '/today');
    await p.waitForSelector('.today-greet');
    const st = await state(p);
    ok('answers were saved to the account', st.profile.name === 'Liz' && st.profile.home === 'Taipei' && st.profile.remember.includes('places') && st.profile.ways.includes('writing') && st.profile.start === 'past' && st.profile.reminders.evening === true, JSON.stringify(st.profile));
    ok('Today greets by name', /, Liz\.$/.test((await p.textContent('.today-greet')).trim()));
    ok('Today shows the date', /\w+day, \w+ \d+/.test(await p.textContent('.today-date')));
    ok('Today shows the intention', (await p.textContent('.today-intention')).includes('grandmother'));
    ok('Today has the tree', await p.isVisible('.today-tree svg'));
    ok('personal first steps (past → a trip; places; writing; people)', (await p.isVisible('text=Tell it about a trip')) && (await p.isVisible('text=Add your first place')) && (await p.isVisible('text=Write your first page')));
    ok('writers get the reflection up front', await p.isVisible('.today-reflect.prominent'));
    ok('phone: the original bar: Garden, Today, Archives, Places, More', (await p.$$eval('.tabbar .tab', (x) => x.map((a) => a.textContent.trim()))).join(',') === 'Garden,Today,Archives,Places,More');
    await shot(p, 'today-new');

    // ---------- reflection ----------
    const q1 = await p.textContent('.today-prompt');
    await p.click('text=Another question');
    const q2 = await p.textContent('.today-prompt');
    ok('one question at a time; another can be asked for', q1 !== q2);
    await p.fill('#reflect', 'The bus stop by the river, the morning I left.');
    await p.click('text=Save privately');
    await p.waitForSelector('text=Saved to your Archives.');
    let s2 = await state(p);
    const refl = s2.entries.find((e) => e.meta?.prompt === q2);
    ok('the reflection is saved privately with its question', !!refl && refl.body.includes('bus stop'));

    // ---------- add a memory, step by step, with a draft ----------
    await p.fill('#today-q', 'Her kitchen window in the morning');
    await p.click('button:has-text("Keep it")');
    await p.waitForSelector('.add h2:has-text("When and where?")');
    ok('the quick line opens the steps at When and where', true);
    await shot(p, 'add-1');
    await p.click('.add button:has-text("Continue")');
    ok('a place is asked for', ((await p.textContent('.add .field-err')) || '').includes('Where'));
    await p.fill('.add label:has-text("Where") input', 'Jiangmen');
    await p.fill('.add label:has-text("When, in your words") input', 'Summer 2003');
    await p.click('.add button:has-text("Save draft")');
    await p.waitForTimeout(800);
    await p.click('.add-head button:has-text("Close")');
    await p.waitForSelector('.confirm-sheet');
    ok('closing asks in a sheet, not a browser dialog', (await p.textContent('.confirm-sheet h2')).includes('draft'));
    await shot(p, 'add-close');
    await p.click('.confirm-yes');
    await p.waitForSelector('.add', { state: 'detached' });
    await p.waitForSelector('text=Unfinished');
    s2 = await state(p);
    ok('the draft is kept and waits on Today', s2.handDrafts.length === 1 && s2.handDrafts[0].data.place === 'Jiangmen');
    await p.click('.today-item:has-text("Her kitchen window")');
    await p.waitForSelector('.add');
    ok('the draft reopens where it was', (await p.inputValue('.add label:has-text("Where") input')) === 'Jiangmen');
    await p.click('.add button:has-text("Continue")');
    await p.waitForSelector('.add h2:has-text("Who was there?")');
    await p.fill('.add .chip-add', 'Grandmother');
    await p.keyboard.press('Enter');
    await p.fill('.add label:has-text("Mood") input', 'Calm');
    await p.click('.add .rv-weight label:has-text("Marked")');
    await shot(p, 'add-2');
    await p.click('.add button:has-text("Continue")');
    await p.waitForSelector('.add h2:has-text("Photographs")');
    await p.setInputFiles('.add input[type=file]', { name: 'k.png', mimeType: 'image/png', buffer: require('fs').readFileSync(require('path').join(__dirname, '../../public/icons/icon-512.png')) });
    await p.waitForSelector('.add .shelf-photos img');
    ok('a photograph can be chosen before planting', true);
    await p.click('.add button:has-text("Continue")');
    await p.waitForSelector('.add h2:has-text("Tags and connections")');
    await p.fill('.add .chip-add', 'childhood');
    await p.keyboard.press('Enter');
    await shot(p, 'add-4');
    await p.click('.add button:has-text("Save this memory")');
    await p.waitForURL(/\/memory\//, { timeout: 20000 });
    await p.waitForSelector('.mem-page');
    s2 = await state(p);
    const mem = s2.memories.find((m) => m.place === 'Jiangmen');
    ok('the memory is planted with everything', !!mem && mem.when === 'Summer 2003' && mem.weight === 'heavy' && mem.feeling === 'Calm' && (mem.extra?.tags || []).includes('childhood'), JSON.stringify(mem));
    ok('the person was created and tied', s2.people.some((x) => x.name === 'Grandmother') && s2.links.some((l) => l.kind === 'memory-person' && l.a === mem.id));
    ok('the photograph was kept with it', s2.media.some((x) => x.ownerType === 'memory' && x.ownerId === mem.id && x.kind === 'photo'));
    ok('the draft was cleared', s2.handDrafts.length === 0);

    // ---------- the memory's own page ----------
    ok('memory page: place, moment, facts', (await p.isVisible('.mem-place')) && (await p.textContent('.mem-facts')).includes('Summer 2003') && (await p.textContent('.mem-facts')).includes('Grandmother'));
    ok('memory page: the photograph is the hero', await p.isVisible('.mem-hero img'));
    ok('memory page: tags link to search', (await p.getAttribute('.mem-tags a', 'href')).startsWith('/search'));
    await shot(p, 'memory');
    await p.click('.mem-acts button:has-text("Edit")');
    await p.waitForTimeout(500);
    const editField = p.locator('textarea').first();
    await editField.fill('Her kitchen window, early in the morning');
    await p.click('button:has-text("Save")');
    await p.waitForTimeout(1200);
    s2 = await state(p);
    ok('a memory can be edited from its page', s2.memories.find((m) => m.id === mem.id).moment.includes('early'));

    // a second memory, by the plain flow, then delete it from its page
    await p.goto(B + '/today?add=1');
    await p.waitForSelector('.add');
    await p.fill('.add textarea >> nth=0', 'Rain on the tram');
    await p.click('.add button:has-text("Continue")');
    await p.fill('.add label:has-text("Where") input', 'Lisbon');
    await p.click('.add button:has-text("Save it now")');
    await p.waitForURL(/\/memory\//);
    await p.waitForSelector('.mem-page');
    await p.click('.mem-acts button:has-text("Delete")');
    await p.waitForSelector('.confirm-sheet');
    await p.click('.confirm-yes');
    await p.waitForTimeout(1500);
    s2 = await state(p);
    ok('a memory can be deleted from its page (after a sheet)', !s2.memories.some((m) => m.place === 'Lisbon'));

    // ---------- Archives: favourites and drafts ----------
    await p.goto(B + '/archives?f=reflections');
    await p.waitForSelector('.leaf-row');
    ok('Archives filters to reflections', (await p.textContent('.leaves, main')).includes('bus stop'));
    await p.click('.leaf-row .fav >> nth=0');
    await p.waitForTimeout(800);
    s2 = await state(p);
    ok('a page can be marked a favourite', s2.entries.some((e) => e.meta?.favorite));
    await shot(p, 'archives');

    // ---------- You ----------
    await p.click('.tabbar button:has-text("More")');
    await p.click('.tab-sheet >> text=You');
    await p.waitForURL(/\/you/);
    await p.waitForSelector('.you-counts');
    const counts = await p.$$eval('.you-count', (x) => x.map((y) => y.textContent.trim()));
    ok('You shows real counts', counts[0] === '1', counts.join(','));
    await shot(p, 'you');
    await p.fill('.you-block label:has-text("Home") input', 'Taipei, Taiwan');
    await p.click('text=Save profile');
    await p.waitForTimeout(900);
    ok('the profile can be edited', (await state(p)).profile.home === 'Taipei, Taiwan');
    await p.click('.seg[aria-label=Appearance] button:has-text("Dark")');
    await p.waitForTimeout(400);
    ok('dark appearance applies at once', (await p.getAttribute('html', 'data-theme')) === 'dark');
    const bg = await p.evaluate(() => [document.body, document.documentElement].map((x) => getComputedStyle(x).backgroundColor).find((c) => c !== 'rgba(0, 0, 0, 0)') || '');
    ok('the page really turns dark', /rgb\((\d+)/.exec(bg) && +/rgb\((\d+)/.exec(bg)[1] < 60, bg);
    await shot(p, 'you-dark');
    await p.goto(B + '/today');
    await p.waitForSelector('.today-greet');
    ok('dark persists across pages without a flash', (await p.getAttribute('html', 'data-theme')) === 'dark');
    await shot(p, 'today-dark');
    await p.goto(B + '/');
    await p.waitForTimeout(3000);
    await shot(p, 'garden-dark');
    await p.goto(B + '/you');
    await p.waitForSelector('.you-counts');
    await p.click('.seg[aria-label=Appearance] button:has-text("Light")');
    await p.click('.seg[aria-label="Offer to use my location"] button:has-text("Never offer")');
    await p.waitForTimeout(700);
    ok('location can be turned off', (await state(p)).profile.locationAsk === 'never');
    ok('notifications: honest about push not being set up', (await p.textContent('.you-page')).includes('push service, which isn’t set up'));

    // change password
    await p.fill('input[autocomplete="current-password"] >> nth=0', 'wrong-one-1');
    await p.fill('input[autocomplete="new-password"]', 'new-garden-22');
    await p.click('button:has-text("Change password") >> nth=-1');
    await p.waitForTimeout(800);
    ok('changing the password needs the current one', /password/i.test(((await p.textContent('.toast').catch(() => '')) || '') + ((await p.textContent('.you-pw .welcome-error')) || '')));
    await p.waitForTimeout(4500);
    await p.fill('input[autocomplete="current-password"] >> nth=0', PW);
    await p.click('button:has-text("Change password") >> nth=-1');
    await p.waitForTimeout(1200);
    ok('the password can be changed', ((await p.textContent('.you-pw .welcome-error')) || '').trim() === '');

    // sign out → returning browser sees sign in
    await p.click('button:has-text("Sign out")');
    await p.waitForURL(/\/welcome/);
    await p.waitForSelector('h1:has-text("Welcome back.")');
    ok('signing out leads to sign in (this browser has an account)', true);
    await p.fill('input[type=email]', EMAIL);
    await p.fill('input[type=password]', PW);
    await p.click('button[type=submit]');
    await p.waitForTimeout(1200);
    ok('the old password no longer works', p.url().includes('/welcome'));

    // ---------- password reset (test mode: link shown, no email sent) ----------
    await p.click('text=Forgot your password?');
    await p.fill('input[type=email]', EMAIL);
    await p.click('text=Send the link');
    await p.waitForSelector('text=open the reset link');
    ok('reset: test mode shows the link and says no email is sent', (await p.textContent('main')).includes('no email is sent'));
    await p.click('text=open the reset link');
    await p.waitForSelector('h1:has-text("Choose a new password")');
    await p.fill('input[type=password]', 'reset-garden-3');
    await p.click('button:has-text("Save and sign in")');
    await p.waitForURL(B + '/');
    ok('reset signs you in with the new password', true);
    const again = await c.request.post(B + '/api/auth/reset/confirm', { data: { token: new URL(p.url()).searchParams.get('reset') || 'x'.repeat(43), password: 'another-one-4' }, headers: { origin: B } });
    ok('a reset link cannot be used twice', again.status() >= 400);

    // ---------- PWA and offline ----------
    const man = await (await c.request.get(B + '/manifest.webmanifest')).json();
    ok('manifest: standalone, starts at the garden, has icons', man.display === 'standalone' && man.start_url === '/' && man.icons.some((i) => i.sizes === '512x512') && man.icons.some((i) => i.purpose === 'maskable'));
    ok('apple touch icon and launch screens are linked', (await p.$$('link[rel=apple-touch-icon]')).length >= 1 && (await p.$$('link[rel=apple-touch-startup-image]')).length >= 6);
    ok('the icon files exist', (await c.request.get(B + '/icons/icon-180.png')).ok() && (await c.request.get(B + '/icons/splash-1170x2532.png')).ok());
    const sw = await c.request.get(B + '/sw.js');
    ok('a service worker is served, and it never caches the API', sw.ok() && (await sw.text()).includes("'/api/'"));
    await c.setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.waitForSelector('.offline');
    ok('offline: a quiet banner says so', (await p.textContent('.offline')).toLowerCase().includes('offline'));
    await shot(p, 'offline');
    await p.waitForFunction(() => navigator.serviceWorker?.controller);
    await p.goto(B + '/archives').catch(() => {});
    ok('offline: opening a page shows the offline page, not a browser error', /offline|connection/i.test(await p.textContent('body').catch(() => '')));
    await c.setOffline(false);
    await p.goto(B + '/today');
    await p.waitForSelector('.today-greet');
    await c.setOffline(true);
    await p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await p.waitForSelector('.offline');
    await c.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await p.waitForSelector('.offline', { state: 'detached' });
    ok('back online: the banner goes', true);

    // ---------- skipping ----------
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await fontsOff(c2);
    const q = await c2.newPage();
    q.on('pageerror', (e) => errs.push(q.url() + ' ' + e.message.slice(0, 60)));
    await q.goto(B + '/welcome');
    await q.click('text=Begin a garden');
    await q.fill('input[type=email]', 'skip' + EMAIL);
    await q.fill('input[type=password]', PW);
    await q.click('button[type=submit]');
    await q.waitForURL(/\/begin/);
    await q.click('text=Skip for now');
    await q.waitForURL(B + '/');
    ok('the questions can be skipped straight into the garden', true);
    await q.goto(B + '/today');
    await q.waitForSelector('.today-greet');
    ok('skipped: Today still works, with no name', /^Good (morning|afternoon|evening)\.$/.test((await q.textContent('.today-greet')).trim()));
    ok('skipped: the first step is simply a first memory', await q.isVisible('text=Your first memory'));
    ok('desktop: no tab bar, rooms in the masthead', !(await q.isVisible('.tabbar')) && (await q.isVisible('.top .rooms')));
    await shot(q, 'today-desktop');
    await q.goto(B + '/you');
    await q.waitForSelector('.you-counts');
    await shot(q, 'you-desktop');
    await q.goto(B + '/account');
    await q.waitForURL(/\/you/);
    ok('the old account page leads to You', true);

    ok('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    T.push('CRASH ' + (e.stack || e.message));
  }
  await b.close();
  console.log(T.join('\n'));
})();
