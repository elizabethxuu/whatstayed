# What Stayed — engineering and product report

November 19, 2026. Covers the work done against the *Complete Product Build, Design & Engineering Brief*, in two phases (commits `03fb708` and the one that adds this file).

---

## A. Product audit: where it started

**What existed**
- **The Garden:** a conversation with a Claude agent (Vercel AI SDK). When you described a moment, its `plantMemory` tool added a blossom to a seeded, swaying SVG tree. There was a transcript, a memory card, and "Begin again".
- **The Archives:** free-form journal pages with autosave, search, month grouping, delete, and a hand-off of a page into the garden conversation.
- **Places:** an Equal Earth atlas (d3-geo + world-atlas, drawn locally) with optional memory locations, place pages, OpenStreetMap search, one-time geolocation behind an explanation, and red threads that existed only once the person approved them.

**What was broken or not production-ready**
- **No accounts and no database.** Everything (conversation, memories, pages, places, threads) lived in the browser's `localStorage`. Clearing the browser or switching devices lost it all, and it could never be multi-user.
- **No way to add, edit or delete a memory by hand.** Memories existed only as tool calls inside the chat transcript, so a typo in a memory could never be fixed.
- **No photographs or voice notes anywhere.**
- **No People, Timeline, Collections, Letters, revisits, unified search or export.**
- **No lint setup, no unit tests.** The browser test scripts lived outside the repo.

---

## B. What changed

### Phase 1: a real app
- **Accounts:** email and password sign-up and sign-in, sign out, 30-day sessions.
- **Persistent Postgres storage** for everything, scoped to the signed-in person.
- **Memories:** plant by hand, edit, and "let it go" (delete, along with its place, threads and media). The agent now writes its memories straight into the account.
- **Photographs and voice notes** on memories and Archive pages:
  - Photos are resized in the browser to at most 2000px.
  - Voice notes record through the microphone only after a plain-language explanation, or you can upload an audio file.
  - Both play back, open large (photos), and can be deleted.
- **Red threads:** the reason for a thread can be added and edited.
- **Archive pages can be re-dated.**
- **One-time, opt-in import** of older browser-only data. Nothing moves unless the person says so; nothing already in the account is overwritten.
- **Account page:**
  - Real counts of what you've kept.
  - A full `.zip` export: everything as JSON, plus every photo and recording.
  - Sign out.
  - Delete everything, which asks for the password again.
  - A plain statement of what is and isn't true about your data's security.
- **Honest "not connected" screen** when no database is configured, instead of pretending to save.

### Phase 2: the rest of the brief
- **People:**
  - Profiles with name, relation, a line about them, photos, voice notes and private notes.
  - Memories and pages connect to a person. "Who was there?" on every memory card.
  - Each person's page lists their shared memories and pages.
  - Removing a person keeps the memories; only the connection goes.
- **Timeline:**
  - Memories, pages, letters and "important days" (milestones you mark), newest year first, grouped by month.
  - Filters by year, month, kind and person, with a count of what's showing.
  - "On this day" at the top.
- **The Archives:**
  - Pages gain an optional place, people, and ties to memories (with a reason).
  - New filters: by person and "with photographs".
  - A memory card lists the pages written about it.
  - Place pages list the pages written there.
- **Collections:**
  - Named groups of memories and pages, with a chosen cover photo (falls back to the first photo).
  - **Export:** a printed edition you can "Print or save as PDF" (print styles: cover, one piece per page, an end page).
  - **Export:** "Download as a web page", a single self-contained `.html` with the photos inside that opens offline and signed out.
- **Letters to your future self:**
  - Choose a date: in a year, 5 years, 10 years, or any future date.
  - **A sealed letter's words never leave the server before its day**, not even to your own browser.
  - On the day, the garden says a letter has arrived. You can choose to open one early.
- **Revisits:** the garden quietly surfaces letters that have arrived, the same day in earlier years, and anniversaries. Each one opens its memory. Nothing is invented; all of it comes from dates you gave.
- **Unified search:** across memories, pages, places, people (including their notes), collections and letters, with highlighting, grouped results and an honest empty state.
- **Masthead:** the brand and two icons (search, account) on top; all seven rooms below. On a phone the room links scroll sideways and start with the current room in view.

### Design
- Every new room uses the existing language: ivory and mist grounds, Cormorant italic for anything personal, small tracked capitals for labels, the muted red reserved for threads.
- No cards-in-grids dashboard. Lists are editorial: dates in the margin, years set large on the Timeline.
- Notices are quiet one-line toasts. Errors are in the cherry tone and say what happened ("You seem to be offline. Nothing was changed.").
- Fixed during QA:
  - The phone memory card could climb over the masthead and hide "Plant by hand". It's now a bottom sheet that scrolls inside.
  - Search used Chrome's bright-blue clear button and default link colours. Both are now restyled.

### Backend
- 15 tables (`lib/server/db.ts`), created automatically on first connection:
  - users, sessions, conversations, memories, entries, locations, threads, dismissed, media
  - people, links, collections, collection_items, letters, milestones
- 33 API routes under `app/api/`. All take JSON (media uploads are multipart), all input is validated with zod, and every query is scoped to the signed-in user.

---

## C. Technical architecture

| Layer | What it is |
|---|---|
| **Frontend** | Next.js 15 App Router, React 19, TypeScript. Each room is a server page that checks the session and loads the person's data, then renders client components. One client store per page (React context, never shared between requests) keeps a live copy and sends every change to the API. |
| **Backend** | Next.js route handlers (`app/api/**`) on Vercel's Node runtime. Shared helpers: `withUser` (session, same-origin check, error mapping), zod schemas, and `lib/server/data.ts` + `lib/server/life.ts` for every query. |
| **Database** | Postgres. In production: Neon via `DATABASE_URL` (or `POSTGRES_URL`), using `pg` with a small pool. Locally and in tests: PGlite, a real Postgres engine in-process (`.data/pglite`, or in memory), so dev and tests run the same SQL. |
| **Authentication** | Email + password. scrypt hashes (N=16384, r=8, p=1, 16-byte salt). Sessions are 32 random bytes in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production); only a SHA-256 of the token is stored. Logging in to a missing account still runs a hash, so timing doesn't reveal which emails exist. |
| **Storage** | Photos and recordings stored as `bytea` in the `media` table, served only to their owner with `Cache-Control: private` and `nosniff`. Allowed types: JPEG/PNG/WebP, and common audio types. 4 MB per file (Vercel's request limit is 4.5 MB). |
| **External services** | **Anthropic** (the garden's replies; the key stays on the server). **OpenStreetMap Nominatim** for place search (free, no key; only called when you search). **Google Fonts** (Cormorant Garamond, Inter). The map itself is drawn locally. No paid services were added. |
| **Deployment** | Vercel. Needs `ANTHROPIC_API_KEY` (already set) and a database: **Storage → Create Database → Neon (free) → connect to the project**, which sets `DATABASE_URL`. Then redeploy. Without a database the app shows a "not connected" screen instead of losing writes. |

---

## D. QA report

All of these were run, in this environment, on the final code:

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | **Pass**, no errors |
| ESLint (`npm run lint`, next/core-web-vitals + next/typescript) | **Pass**, no errors or warnings |
| Unit tests (`npm test`, node:test) | **5/5 pass**: zip writer, CRC32, memory echo logic, tool-call extraction, schema validation |
| Production build (`npm run build`) | **Pass** (one warning from inside the AI SDK package, not this code) |
| E2E: accounts and Phase 1 (`tests/e2e/accounts.js`) | **58/58 pass** |
| E2E: People, Timeline, Collections, Letters, Search, export (`tests/e2e/life.js`) | **60/60 pass** |
| E2E: garden regression (`garden.js`) | **9/9 pass** |
| E2E: Archives regression (`archives.js`) | **23/23 pass** |
| E2E: Places regression (`places.js`) | **36/36 pass** |

**Total: 186 browser checks, 5 unit tests, 0 failures.** The suites are now in the repo; `npm run build && npm run e2e` runs them all, each on a fresh in-memory database.

**The brief's 16 workflows**, each exercised end to end in a real browser:

| # | Workflow | Covered by |
|---|---|---|
| 1 | Sign up and sign in | accounts.js (short-password refusal, wrong-password refusal, session cookie flags) |
| 2–4 | Create a memory; it appears in the garden; edit and delete it | accounts.js (by hand and via the agent; edits and deletion persist after refresh) |
| 5–6 | Journal entry; persists after refresh | accounts.js, archives.js (including a page written in the last second before leaving) |
| 7 | Attach a photograph | accounts.js (memory and page), life.js (person) |
| 8–9 | Add a location; it appears in Places | accounts.js, places.js |
| 10–11 | Person profile; connect a memory to them | life.js |
| 12 | Red thread, with a reason, edited | accounts.js, places.js |
| 13 | Search for an old memory | life.js (finds it and opens it) |
| 14 | Export a collection | life.js (PDF rendered; web page opened offline, signed out) and the full .zip in accounts.js |
| 15–16 | Sign out, sign back in, everything intact | accounts.js, life.js |

**Also tested:**
- **Isolation:** a second account can't read, edit, delete or attach to the first one's memories, media, people, links or collections (all return 404).
- **Errors:** offline save (says so; nothing is planted), required fields, past dates for letters, wrong password on account deletion.
- **Layout:** phone (iPhone 13) and tablet layouts with no sideways scroll on every room.
- **Accessibility and stability:** named controls on the Timeline; no page errors anywhere.

**Bugs found and fixed during QA**
- Phone: an open memory card could cover the masthead and its buttons.
- Search: Chrome's blue clear button and default link colours.
- Search: short pages showed their text twice.
- On phones, the current room's link could start off-screen.
- An agent memory you'd let go could trigger a refresh loop on each later reply.
- Field errors in "Plant a memory" stayed visible after being fixed.
- Voice notes overflowed narrow cards.
- A server/browser render mismatch in the recorder.

**Not tested here**
- Against Neon itself. PGlite is real Postgres, but the production connection hasn't been exercised yet.
- With the real Anthropic model. Tests use a scripted model so they're repeatable.
- Real place search. OpenStreetMap is blocked from this environment, so tests use recorded answers.
- Safari or Firefox (Chromium only).
- A screen reader.

---

## E. Launch readiness

**Ready**
- Accounts, isolation and persistence for every feature.
- Memories, Archives, Places, People, Timeline, Collections, Letters, revisits, search.
- Photos and voice notes.
- Export (.zip of everything, collection PDF and web page) and account deletion.
- Reduced-motion support on the new animations.

**Needs configuration (one step)**
- Add Neon in Vercel → Storage, then redeploy. Until then the live site shows "The garden isn't connected yet."

**Security, stated plainly**
- **In place:**
  - Hashed passwords and hashed session tokens.
  - httpOnly cookies, and same-origin checks on every change.
  - Per-user scoping on every query; validated input; type-checked uploads with size limits.
  - The API key is server-only, and sealed letters are withheld server-side.
- **Not in place:**
  - **No rate limiting on sign-in**, so passwords can be guessed repeatedly.
  - **No email verification or password reset.** A forgotten password currently means a lost account.
  - **No app-level encryption at rest.** Data is encrypted in transit (HTTPS); at-rest encryption and backups are whatever the database provider's plan gives.

**Remaining blockers before inviting other people**
1. Password reset. It needs an email service, so it's a decision for you.
2. Sign-in rate limiting.

For your own use, neither blocks launch.

---

## F. Next steps, in priority order

1. **Connect Neon and redeploy**, then do one pass on the live site: sign up, plant, add a photo, sign out and back in.
2. **Sign-in rate limiting.** Small, no new service: count failed attempts per email and IP in Postgres.
3. **Password reset by email.** Needs a sender. Resend's free tier would do; I'd want your OK before adding it.
4. **Move photos and recordings out of Postgres** once the account grows (Vercel Blob or Cloudflare R2). The current limit is the free database size, not code.
5. **Load data per room instead of the whole account per page.** It's fast at personal scale (hundreds of items) but should be paged at thousands.
6. **The tree's next layer from the brief:** branches that represent people, places and periods, and hover hints on branches (today they're on blossoms).
7. **Cross-browser pass** (Safari and Firefox) and a screen-reader pass.

---

## Design update: The White Garden (November 19)

- **Palette:** porcelain `#FEFEFC`, ivory `#F8F7F2`, mist `#F1F2EF`, pale stone `#E8E8E2`, botanical grey `#B9BDB7`, branch grey `#929991`, charcoal `#343733`, and the muted red `#874D50`. Every pink is gone. The red appears only on red threads, a meaningful (heavy) blossom's heart, errors, the letter seal and very small active marks.
- **Tree:**
  - Finer branches that pale and turn translucent toward the tips, with light along the older limbs.
  - A tapering, leaning trunk.
  - Pale leaves that each move on their own timing.
  - Almost-white translucent blossoms, each a slightly different size and shape, that unfold slowly.
  - Fine twiglets appear as memories accumulate, so the crown becomes more intricate.
  - While the agent is replying, the light around the tree gathers.
- **Type:** light serif titles. Sentence-case sans labels with almost no tracking; capitals remain only on small month dividers and the tagline.
- **Conversation:** the input is barely there until you reach for it. Your last words appear as a quiet italic recollection.
- **Phones:** a translucent bottom tab bar (Garden, Archives, Places, People, More), fine-line icons and a small red dot for where you are. Timeline, Collections, Letters, Search and your account live under More.
- **Arrival:** the bare tree draws itself beside the sign-in form.
- **Atmosphere:** the faintest grain over everything.
- **Tested** (`tests/e2e/white.js`, 25 checks):
  - Each room measures 98–99% white or near-white.
  - No pinks anywhere.
  - Twiglets grow with memories.
  - The tab bar and More sheet work.
  - Reduced motion holds the tree still.
  - All earlier suites still pass (186 checks).

---

## The conversational memory agent (November 19)

**What changed:** the agent no longer saves anything by itself. It *drafts* memories as you talk, and nothing reaches the garden until you review it.

- **Drafting:**
  - One story can hold several memories, each drafted separately: title, moment and narrative (in your words), place, when (as you said it), the period as a date, people, sensory details, objects, and what you weren't sure of.
  - Corrections replace the earlier draft instead of adding another.
  - The agent is told today's date, the memories already in your garden, your people, and the drafts so far, so its suggestions refer to real things.
- **Review:**
  - Edit everything, see each place found on the map (OpenStreetMap, changeable), add or remove people (new ones are created only on save), and accept, edit or dismiss suggested red threads.
  - Choose which drafts to keep: save all, save some, discard one or discard the whole draft.
  - After saving you can attach photos straight away, and the newest memory opens on the tree.
- **Trip mode** ("Tell it about a trip"):
  - The agent names the trip once it knows where (and when).
  - It follows a gentle arc (where, when, who, what you remember most, places, surprises, feelings, small details, what you wish you'd captured), adapting and skipping as you go.
  - Saving creates the memories, a collection for the trip, and a page in the Archives with the trip in your own words, tied to each memory.
- **The tree:**
  - Drafts appear as closed buds while you talk and open into blossoms when saved.
  - Memories from one trip grow near each other, and tied memories grow near their partner.
  - Small marks show which blossoms have photos, a pin on the map, or a red thread.
- **Conversations:**
  - Every conversation is kept and listed: resume, start new, or delete (memories you saved from it stay).
  - The full transcript is one tap away.
  - Your earlier single conversation was moved into this list automatically.
- **Voice:**
  - Uses the browser's own speech recognition (Chrome, Edge, Safari), started only when you tap the microphone, after a plain explanation.
  - Speech lands in the writing line to review before sending.
  - What Stayed keeps no audio. In Chrome and Safari the browser maker transcribes it.
  - Where it isn't supported, the microphone doesn't appear and typing works as before.
- **Failure:** if a reply fails, the app says so (nothing is invented) and offers *Try again* or *Write it yourself*.
- **Rate limits** (stored in Postgres, no new service): 40 agent replies per person every 10 minutes, and 8 failed sign-ins per email (30 per network address) every 15 minutes.
- **Separation of facts:**
  - Drafts live in their own table until confirmed.
  - Saved memories record that they came from a conversation, which fields were uncertain, and the date's precision (year, month or day), so the Timeline never invents a day.
- **Tested** (`tests/e2e/conversation.js`, 52 checks; `garden.js` rewritten for the review flow):
  - All 14 acceptance steps, on desktop and phone.
  - Corrections, connections, the trip page and collection.
  - Voice (with a stand-in for the browser's recogniser), failure and retry, history, isolation between accounts, and both rate limits.
  - Bug found and fixed: opening an older conversation from the list could save its words into the one you came from.
- **Not tested here:** the real Claude model (tests use a scripted stand-in with the same tools), real speech recognition, and the deployed site.


## The app (November 19)

What Stayed now opens like an app rather than a website: a nine-screen welcome, a personal Today, five tabs on a phone, a step-by-step way to add a memory, a page for each memory, a You room, dark mode, and installation on the home screen.

### What was built

- **Welcome (onboarding).** Nine screens, one question each: what stayed with you; what you'd like to remember; about you (name, birthday, home, time zone guessed from the device); how you remember; past or today; what you'd most like to preserve (shown on Today only if you choose); reminders; create an account; "Every life leaves something behind." Every screen can be skipped. Answers survive a reload before the account exists, then are saved to the account. A browser that has signed in before opens on **Sign in** instead. Apple sign-in isn't offered: it needs an Apple Developer account and keys that aren't configured.
- **Today.** Greeting with the person's name and the date, their intention, the tree, "What would you like to remember today?", a daily reflection (one question at a time, saved privately to the Archives, optionally tied to a memory), unfinished drafts and conversations, revisits, recently added and recently revisited memories.
- **Personalisation that does something.** The onboarding answers choose Today's first steps (start from the past → tell it about a trip; places → add a place; writing → write a page and the reflection comes first; people → add a person; photographs; chapters → the Timeline). The intention and home are given to the conversation agent as context. The evening reflection toggle brings the question forward after 6 pm; the weekly review shows the week's memories on Sundays; "a year ago" controls revisits.
- **Adding a memory.** A sheet in five steps (the memory; when and where; who was there and the mood; photographs; tags and red threads). It can be saved as a draft at any step, and closing asks whether to keep it. Drafts wait on Today.
- **A page for each memory** (`/memory/<id>`): photographs, place, title, moment, story, when, where, who, mood, tags, trip, connections, photos and voice notes, edit and delete.
- **Archives:** favourites, drafts, and reflections (with their question) as filters; a star on each page.
- **You:** photo, profile and onboarding answers (editable), real counts, appearance (automatic/light/dark), daily reflection and reminders, notification permission, location ("offer it" / "never offer"), export, change password, sign out, delete personal info, delete the account. The old /account address leads here.
- **Password.** Change it (needs the current one; other devices are signed out). Reset by email link (single use, one hour, rate limited).
- **App behaviour.** Bottom tab bar with haptics, pull to refresh, sheets instead of browser confirm boxes everywhere, keyboard-aware sheets, an offline banner, an offline page when opened without a connection, dark mode without a flash, safe areas on notched phones, reduced motion respected.
- **Installable.** Manifest, icons (including maskable), Apple touch icon, launch screens for eight iPhone sizes, a service worker that caches only the app's own files (never your memories, pages or photographs).
- **A safety copy while writing.** A page being written is also kept in this browser, per account, until the account confirms it. While testing, a page typed seconds before leaving was sometimes lost when the service worker was active (the browser dropped the last-moment save). The copy is now sent on the next visit, so those words aren't lost.
- **Fixed along the way:** title, story and tags were dropped from memories added by hand without a title.

### What needs a service or account that isn't set up

| Feature | Status | What it needs |
|---|---|---|
| Password reset email | Built; switched off until configured. Says so honestly. | A Resend account and verified domain: `RESEND_API_KEY`, `RESET_FROM_EMAIL` |
| Notifications while the app is closed | Not built. Reminders appear in Today; device permission is asked only when you tap the button. | A Web Push service (VAPID keys) and a scheduled job; on iPhone, iOS 16.4+ with the app on the home screen |
| Sign in with Apple | Not offered | Apple Developer account ($99/yr), a Services ID and keys |
| App Store app | Not built | See below |

### Capacitor (an App Store version)

The app could be wrapped with Capacitor, which puts the same web app inside a native iOS shell. It would need:

- a Mac with Xcode;
- an Apple Developer account ($99 a year);
- app review;
- either bundling the site or pointing the shell at the live URL.

Apple tends to reject apps that are only a website in a frame, so it would also need native touches: push notifications, a native photo picker, and probably Sign in with Apple (required once any other sign-in is offered).

Recommendation: use the home-screen web app first. It already opens full screen with its own icon and launch screen. Revisit Capacitor if push notifications or App Store presence become important.

### Checks run

- Typecheck, lint and production build: clean.
- Unit tests: 10 of 10.
- End-to-end suites, run in Chromium on a fresh database with the scripted agent:

| Suite | Checks passed |
|---|---|
| accounts | 60/60 |
| life | 60/60 |
| garden | 10/10 |
| archives | 23/23 |
| places | 36/36 |
| white | 25/25 |
| conversation | 52/52 |
| app (new) | 67/67 |

- Screens were checked by eye on a phone (iPhone 13 size) and on desktop, in light and dark.
- These checks ran locally, not against the deployed site.

## Design update: the Glass Garden (November 19)

The White Garden felt too still, so colour was added without losing the white:

- **The air:** soft sage and pale-blue washes in the corners of every screen, plus a very slow drifting light behind everything. Reduced-motion settings turn the drift off.
- **Glass:** frosted, translucent panels with a bright edge for the garden card, the Today panels, the You sections, the memory facts and the review. On phones the tab bar is a floating glass bar, and the current tab sits in a sage-and-blue pill. Sheets you write in stay solid, so the page behind never shows through the words.
- **Colour in the details:**
  - Main buttons are sage-to-blue pills; choices fill with the same gradient when picked.
  - Toggles, the progress line and step dots use sage and blue.
  - Dates and section labels are in sage; tags are sage chips; counts are in the gradient.
  - Leaves are sage, the tree's light is pale sky, and the "mist" blossom heart is blue. Blossoms stay white, and the one marked memory keeps its red.
- **Dark mode** uses the same palette in deeper tones.
- The phone tab-bar test now expects a floating bar. All suites pass.
- **Known issue:** a hydration warning (React error #418) showed up twice in about ten runs of the app suite and couldn't be reproduced on demand. The suite now logs the page address when it happens.

## The memory agent (November 19, afternoon)

"You talk. It remembers. The tree grows." The conversation is now the main way into the archive: one agent that can find, connect, reflect and organise, as well as capture.

### How it works

- **Tools that do real work.** The agent's tools (`lib/server/agent.ts`) query or change this person's own data in Postgres; none returns canned text.
  - **Finding:** search memories, one memory's details, search pages and reflections, people, places, related memories (each with its evidence), existing red threads, collections, and earlier conversations (their own words, with dates).
  - **Reflecting:** themes (counts only: places, people, tags, years, words that recur across pages), a chronological summary, and forgotten details.
  - **Capturing:** memory drafts, which wait for review as before, and naming a trip.
  - **Changing anything else:** a red thread, a correction, a deletion, a page, an edit to a page, a person, a collection, or keeping a reflection. For these the agent can only make a **proposal**. A proposal is stored as a pending action with a plain description, and it appears as a card with Confirm and "Not now". Only the person's confirmation runs it.
  - Proposals are checked against what exists when they are made, and again when confirmed. Something that can no longer be done is recorded as failed and shown that way.
- **Truthfulness rules** in the system prompt:
  - Answer only from what the tools returned.
  - Keep what the person said, what was extracted, what was inferred and what was confirmed apart.
  - Patterns are counts, not interpretations.
  - Ask one question when a request is ambiguous.
  - Never say something was done unless a tool said so.
- **Retrieval instead of the whole archive.** The prompt carries counts, the 12 most recent memories, people's names, the memory open on screen, and the person's own profile answers. Everything else is fetched with tools.
- **Separate records:**

  | Record | Stored as |
  |---|---|
  | Raw conversations | `talks` |
  | Extracted drafts | `drafts` |
  | Confirmed memories | `memories` |
  | People, places, collections | their own tables |
  | Suggested changes | `actions`, pending |
  | Confirmed changes | `actions`, done, plus the real rows |
  | Agent-written reflections | pages marked `ai`, shown as "written by the agent" |
  | User-approved personal context | the profile, which the person edits in You |

- **Tool log.** Every tool call is recorded with its outcome and time taken (`tool_log`, visible in You). Reads retry once on a passing database error. Every failure becomes an error result that the agent must report.
- Authentication and per-user scoping on every query, rate limiting (now a sliding window), streaming replies, and two retries on model errors.

### The experience

- **The garden is home.** Under the tree are three modes, Remember, Ask and Reflect, with suggested prompts built only from what is saved (a place or person that is actually in the garden). Text and voice both work.
- **Activity is shown in words, not a spinner:** Listening, Understanding, Searching the archive, Connecting memories, Preparing a reflection, Growing a new blossom.
- **The tree shows what the agent did:**
  - memories it finds light up softly and are listed to open;
  - a confirmed connection draws the red thread;
  - a confirmed memory grows a blossom.
- **Today has gentle rediscovery suggestions, each with its evidence:**
  - memories waiting for review;
  - unfinished drafts;
  - two memories sharing a place or person that aren't tied;
  - places and people that recur;
  - memories from this date in earlier years.
  Each can be dismissed, and You has a switch to turn them off. Nothing is sent as a notification.

### Look and layout (Liz's direction)

- **Kept from before:** the original white tree, the original sign-in / begin-a-garden page, and the original full-width phone bar (Garden, Today, Archives, Places, More).
- **Combined with the app work:** a new account goes on to the questions (all skippable) at `/begin`. Today and You are still there; You is under More.
- **Glass, in purple and sage:** frosted panels, cards and the bar, with lilac, lavender and sage light in the background. Main buttons are purple-to-sage pills. The deep red is kept for red threads and anything that can't be undone.
- **Phones:** the conversation's input stays above the tab bar, and the suggested prompts swipe sideways.

### Tested (scripted model, real tools, real database)

`tests/e2e/agent.js` checks what the tools did (stored rows, proposals, the log), not only the words:

1. retrieving Paris returns exactly the Paris memories;
2. it says it has nothing about a place that isn't there;
3. it follows a story with a question;
4. one story becomes several stored drafts;
5. only the approved drafts become memories;
6. a connection request searches;
7. it proposes the right red thread and changes nothing until confirmed;
8. confirming creates exactly one thread;
9. it recalls the person's words from an earlier conversation;
10. another account can't find, propose changes to, confirm, or recall any of it;
11. unclear requests ("delete it", "connect this") get a question and no action;
12. a failing tool returns an error instead of crashing, and the failure is logged;
13. the reply says it didn't work and nothing is stored; confirming something that no longer exists is recorded as failed.

Also checked: reflections are built only from stored memories, are offered not saved, and are kept marked as written by the agent; suggestions are evidence-based, dismissable and can be switched off; the phone screen shows modes, prompts, found memories lit on the tree, and proposal cards.

**Limits, honestly:**
- These tests use the scripted model, so they prove the tools, proposals, logging and isolation, not Claude's judgement. The rules for Claude are in the system prompt.
- The real model needs `ANTHROPIC_API_KEY`, which isn't available here.
- The retry on a passing database error isn't exercised by a test.

**Checks run (final):**
- Typecheck, lint and build are clean; unit tests pass 10 of 10.
- End-to-end, 383 checks across nine suites:

  | Suite | Checks passed |
  |---|---|
  | accounts | 60/60 |
  | life | 60/60 |
  | garden | 10/10 |
  | archives | 23/23 |
  | places | 36/36 |
  | white | 26/26 |
  | conversation | 52/52 |
  | app | 68/68 |
  | agent | 48/48 |

- The intermittent React hydration warning (#418) is still open. It appeared in about one run in five of the app suite, on different pages, and not in a development build.

## Design update: Prism Glass, after Liz's portfolio (November 19)

The purple-and-sage look was replaced to match the glass on elizabeth-xu.com:

- **Background:** near-white, with a soft prism glow (pink, peach, butter, mint, sky, lavender) pooled at the top left and echoed at the lower right. It drifts very slowly and holds still for reduced motion.
- **Glass panes:** translucent white, a bright white edge, soft long shadows, a thin prism line along the top edge, and rounded 24–30px corners.
- **Type:** Bodoni Moda for titles and the name; EB Garamond for words; small spaced IBM Plex Mono capitals for labels, tabs and buttons.
- **Buttons:** ink pills, like the portfolio's type.
- **The mark is now the periwinkle blossom.** It sits beside the name, is the app icon and launch screens, and is the agent's activity indicator, turning slowly.
- The tree stays white. The deep red is kept for red threads and anything destructive.
- **Fixed:** the glow layers had been hidden behind the body's background; the page colour now lives on the root element.

**Checks:** all nine browser suites pass (accounts 60, life 60, garden 10, archives 23, places 36, white 26, conversation 52, app 68, agent 48). Typecheck, lint and build are clean.
