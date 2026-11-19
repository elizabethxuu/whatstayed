import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, type LanguageModel, type UIMessage } from 'ai';
import { mockModel } from '@/lib/mock-model';
import { currentUser } from '@/lib/server/auth';
import { ConfigError } from '@/lib/server/db';
import { allow, listDrafts, ownTalk } from '@/lib/server/talk';
import { agentContext, agentTools } from '@/lib/server/agent';
import { getProfile } from '@/lib/server/profile';

export const maxDuration = 30;

const MAX_MESSAGES = 40; // keep long sessions affordable
const MAX_CHARS = 2000; // per message the person sends (a spoken story can run long)
const LIMIT = { turns: 40, windowSec: 600 }; // per person: 40 replies every 10 minutes

const SYSTEM = `You are the memory agent inside What Stayed, a private garden where each saved memory is a blossom on a tree. You help one person capture, find, connect, reflect on and rediscover their memories. You are an invisible presence in the garden, not a chatbot: no greetings, no sign-offs, no lists, headings, emoji or markdown.

How you speak:
- One to three short sentences, at most 60 words. Plain and warm, never gushing. No therapy language. Don't tell them how they feel.
- When capturing, respond to what they said, then ask one question that follows from it: concrete things they can picture (light, weather, who was there, what they did or kept, names of places). Vary questions; never run a checklist. They never have to answer.

First work out what they want, then act with your tools:
- Asking what they remember, about a place, person, time or thing → search (searchMemories, and searchJournal or searchPeople if useful), then answer only from what the tools returned, naming places and moments as stored. Offer to open one. If nothing is found, say so plainly and offer to capture it.
- Telling a story or wanting to remember something → draft memories (draftMemory) as soon as you have a place and one concrete detail, one per distinct moment. Use their words. Mark anything inferred (like a date from "last October") as unsure. Drafts wait for their review; never say a memory is saved or planted.
- Wanting to connect memories → find both (searchMemories / getMemory / findRelatedMemories), explain the evidence in one sentence, then proposeConnection. It is only a suggestion until they confirm.
- Correcting, deleting, writing a page, adding a person, making a collection → use the matching propose tool. Nothing changes until they confirm in the card that appears; say that it's waiting for them.
- Wanting a reflection or a summary → gather real records (findThemes, chronologicalSummary, searchMemories, surfaceForgottenDetails). Build it only from those records, mention which memories it draws on, and offer proposeReflection to keep it (it will be marked as written by you).
- Referring to something they told you before → recallConversations, and use only what they actually said.
- If the request is ambiguous (which memory? which trip?), ask one short question instead of guessing.

Truthfulness, always:
- Never invent memories, details, dates, names, places, people or feelings. Never imply you remember something a tool didn't return.
- Keep apart what they said, what you extracted, what you inferred, and what they confirmed. Inferences are offered as questions, never as facts.
- Patterns are counts, not interpretations: "Paris appears in four memories", not "Paris means a lot to you".
- If a tool returns an error, say plainly that it didn't work. Never say something was done unless a tool said so; proposals are not done until the person confirms.
- No travel advice or facts about places.

Care:
- If something painful comes up, acknowledge it simply, don't probe, and let them choose whether to go on.
- If they want to talk about something unrelated, gently bring it back to their memories.`;

const TRIP = `

This conversation is about one trip. As soon as you know where they went (and when, if they say), call nameTrip once with a plain title like "Edinburgh, October 2025".
Let the conversation move naturally through these, adapting to what they've already told you and skipping anything they've covered: where they went; when; who they were with; what they remember most; the places they visited; what surprised them; how it felt; the small details they still remember; anything they wish they had captured.
When they seem finished, tell them in one short sentence that their memories are ready to review.`;

function pickModel(): LanguageModel | null {
  if (process.env.WHATSTAYED_MOCK === '1') return mockModel();
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return anthropic(process.env.WHATSTAYED_MODEL || 'claude-sonnet-5-5');
}

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Older conversations planted directly; show those to the model as plain notes rather than as calls to a tool that no longer exists. */
function legacyToText(messages: UIMessage[]) {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      if (p.type !== 'tool-plantMemory') return p;
      const input = (p as { input?: { place?: string; moment?: string } }).input;
      return { type: 'text' as const, text: input ? `(Kept earlier: ${input.place} — ${input.moment})` : '(Kept a memory earlier.)' };
    }),
  })) as UIMessage[];
}

export async function POST(req: Request) {
  let user;
  try {
    user = await currentUser();
  } catch (e) {
    if (e instanceof ConfigError) return fail(e.message, 503);
    throw e;
  }
  if (!user) return fail('Please sign in.', 401);
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') || req.headers.get('host'))) return fail('Not allowed.', 403);

  const model = pickModel();
  if (!model) return fail('The conversation isn’t available right now. You can still plant memories by hand.', 503);

  let body: { messages?: UIMessage[]; talkId?: string; focus?: string };
  try {
    body = await req.json();
  } catch {
    return fail('Bad request', 400);
  }
  const talkId = typeof body.talkId === 'string' && /^[\w-]{1,80}$/.test(body.talkId) ? body.talkId : null;
  if (!talkId) return fail('Which conversation is this?', 400);
  let talk;
  try {
    talk = await ownTalk(user.id, talkId);
  } catch {
    return fail('That conversation isn’t here any more.', 404);
  }
  if (!(await allow(`talk:${user.id}`, LIMIT.turns, LIMIT.windowSec))) {
    return fail('That’s a lot of conversation in a short time. Take a breath and try again in a few minutes.', 429);
  }

  const messages = legacyToText(Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : []);
  if (!messages.length) return fail('Nothing to remember yet', 400);
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const part of m.parts) if (part.type === 'text' && part.text.length > MAX_CHARS) part.text = part.text.slice(0, MAX_CHARS);
  }

  // A short picture of the archive; everything else the agent fetches with tools, as it needs it.
  const uid = user.id;
  const focusId = typeof body.focus === 'string' && /^[\w-]{1,80}$/.test(body.focus) ? body.focus : null;
  const [ctxData, drafts, prof] = await Promise.all([agentContext(uid), listDrafts(uid, talkId), getProfile(uid)]);
  const focus = focusId ? ctxData.memories.find((m) => m.id === focusId) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const ctx = [
    `\n\nToday is ${today}.`,
    prof.name ? `Their name is ${prof.name}. Use it rarely, if at all.` : '',
    prof.intention ? `What they told us they most want to preserve: "${prof.intention}". Let it guide which details you ask about; don't quote it back.` : '',
    prof.home ? `They consider home to be: ${prof.home}.` : '',
    `Their archive: ${ctxData.counts.memories} memories, ${ctxData.counts.entries} pages, ${ctxData.counts.threads} red threads, ${ctxData.counts.collections} collections.`,
    ctxData.recent.length
      ? `Most recent memories (id | place | when | moment), for reference; search for anything else:\n${ctxData.recent.map((m) => `- ${m.id} | ${m.place} | ${m.when ?? m.date ?? ''} | ${m.moment}`).join('\n')}`
      : 'Their garden is empty so far.',
    ctxData.people.length ? `People they keep: ${ctxData.people.join(', ')}.` : '',
    focus ? `They have this memory open right now ("this memory"): ${focus.id} | ${focus.place} | ${focus.moment}` : '',
    drafts.length
      ? `Drafted in this conversation (id | status | title | place):\n${drafts.map((d) => `- ${d.id} | ${d.status} | ${d.data.title} | ${d.data.place}`).join('\n')}`
      : '',
    talk.trip ? `This trip is titled "${talk.trip.title}".` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const tools = agentTools(uid, talkId, talk.mode);

  const result = streamText({
    model,
    system: SYSTEM + (talk.mode === 'trip' ? TRIP : '') + ctx,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1500,
    maxRetries: 2,
  });

  return result.toUIMessageStreamResponse({
    onError: () => 'The reply didn’t come through. Nothing was lost — try again, or write the memory yourself.',
  });
}
