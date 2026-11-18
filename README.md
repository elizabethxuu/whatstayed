# What Stayed

Tell it about the places you've been. A quiet agent asks about the moment that stayed with you, and each memory grows into a blossom on a tree. Keep pages in the Archives, pin memories to a map in Places, and tie red threads between the ones that belong together.

## How it's built

- **Next.js 15 (App Router), React 19, TypeScript.**
- **Accounts:** email and password. Passwords are stored only as salted scrypt hashes. Sessions are random tokens in an httpOnly, SameSite=Lax cookie (Secure in production); the database keeps only a SHA-256 hash of each token. Sessions last 30 days.
- **Database:** Postgres. In production, Neon (free tier) via `DATABASE_URL`. Locally, with no `DATABASE_URL`, it runs a real Postgres engine in-process ([PGlite](https://pglite.dev)) and keeps its files in `.data/`. The schema creates itself on first connection (`lib/server/db.ts`).
- **Isolation:** every query is scoped to the signed-in person (`lib/server/data.ts`). Writes from other sites are refused (same-origin check). All input is validated with zod.
- **Photographs and voice notes:** stored in the same database (`media` table), served only to their owner. Photographs are resized in the browser to at most 2000px before upload; files are capped at 4 MB each (Vercel's request limit is 4.5 MB).
- **Agent:** `app/api/remember/route.ts`, built on the Vercel AI SDK with Claude. Its `plantMemory` tool writes straight into the person's garden. It can only *suggest* a connection between memories; a red thread exists only once the person ties it.
- **Places:** map from `world-atlas` + `d3-geo`, drawn locally. Place search uses OpenStreetMap Nominatim (free, no key). Location is always optional; the browser's location is asked for only after an explanation, and only once.
- **Your data:** download everything (JSON + every file, as a .zip) or delete your account from the account page. Older browser-only data is offered for import once, and only moved if you say so.

## Run it locally

```bash
npm install
cp .env.example .env.local   # paste your Anthropic API key
npm run dev                  # uses PGlite in .data/ (no setup)
```

No API key? Use the scripted test agent: `WHATSTAYED_MOCK=1 npm run dev`.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Deploy on Vercel

1. In the Vercel project, open **Storage → Create Database → Neon** (free plan) and connect it to this project. That adds `DATABASE_URL` for you.
2. Under **Settings → Environment Variables**, make sure `ANTHROPIC_API_KEY` is set.
3. Redeploy.

Without a database, the app says plainly that it isn't connected rather than pretending to save anything. Without an API key, everything works except the agent's replies; you can still plant memories by hand.
