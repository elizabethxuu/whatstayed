# What Stayed

Tell it about the places you've been. A quiet agent asks about the moment that stayed with you, and each memory grows into a blossom on a tree.

- **Agent:** `app/api/remember/route.ts`, built on the Vercel AI SDK with Claude. It asks one gentle question at a time and calls a `plantMemory` tool when you've shared a specific moment.
- **Tree:** `lib/tree.ts` grows the same seeded tree every visit, so blossoms keep their place. `components/Tree.tsx` draws it.
- **Garden:** `components/Garden.tsx` holds the conversation, the memory cards and the transcript.
- **Privacy:** each visitor's tree is saved only in their own browser. There's no database and no accounts.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

To try it with no API key, use the scripted test agent instead:

```bash
WHATSTAYED_MOCK=1 npm run dev
```

## Deploy on Vercel

1. Import this repo in Vercel (framework: Next.js; no other settings needed).
2. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
3. Deploy. Optionally add the domain `whatstayed.vercel.app`.

Optional: set `WHATSTAYED_MODEL` to use a different Claude model.

Without a key, the page still loads and says the garden is resting.
