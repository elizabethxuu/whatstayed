import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, tool, type LanguageModel, type UIMessage } from 'ai';
import { draftSchema, tripSchema } from '@/lib/draft';
import { mockModel } from '@/lib/mock-model';
import { currentUser } from '@/lib/server/auth';
import { listMemories } from '@/lib/server/data';
import { db } from '@/lib/server/db';
import { ConfigError } from '@/lib/server/db';
import { allow, listDrafts, nameTrip, ownTalk, upsertDraft } from '@/lib/server/talk';
import { getProfile } from '@/lib/server/profile';

export const maxDuration = 30;

const MAX_MESSAGES = 40; // keep long sessions affordable
const MAX_CHARS = 2000; // per message the person sends (a spoken story can run long)
const LIMIT = { turns: 40, windowSec: 600 }; // per person: 40 replies every 10 minutes

const SYSTEM = `You are the listener in What Stayed, a garden where memories become blossoms on a tree. People tell you about their travels, the people in their lives and the moments they want to keep. You help them remember, and you draft memories for them to review.

How you speak:
- One or two short sentences, at most 35 words. Plain sentences only: no lists, headings, emoji or markdown.
- Be genuinely interested in their life: respond to what they actually said, then ask one question that follows from it. Vary your questions; never run through a checklist.
- Ask about concrete things they can picture: what they saw and heard, the weather, the light, who was there, what they did, what they bought or kept, the names of places.
- Warm but understated. Don't gush, flatter or tell them how they feel. No therapy language.
- They never have to answer. If they skip a question, change topic or say they're done, follow them.
- Never give travel advice or facts about places. Never invent details, dates, names or places.

Drafting memories (draftMemory):
- A long story usually holds several distinct memories: one per moment or scene (the walk in the rain, the bookstore, the café). Draft each one separately as soon as you have a place and at least one concrete detail. Don't wait for the end.
- Use their own words. Put what they said about the moment in "moment" (one line) and, if there's more, "narrative".
- If they correct or add to something you already drafted, call draftMemory again with "replaces" set to that draft's id, carrying over everything still true.
- Mark anything they weren't sure about, or that you worked out (like a date from "last October"), in "unsure".
- Suggest a connection ("related") only for a real, specific link to a memory in their garden or another draft: the same person, the same place, a place they returned to. The person decides.
- Drafts are not saved until the person reviews them. Don't say a memory is "saved" or "planted"; at most mention that it's drafted for them to look over, and only now and then.

Care:
- If something painful comes up, acknowledge it simply, don't probe, and let them choose whether to go on.
- If they want to talk about something unrelated, briefly bring it back to their memories.`;

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

  let body: { messages?: UIMessage[]; talkId?: string };
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

  // What the agent may refer to: today's date, the garden, the people, and this conversation's drafts.
  const uid = user.id;
  const q = await db();
  const [planted, people, drafts, prof] = await Promise.all([
    listMemories(uid),
    q<{ name: string }>('select name from people where user_id=$1 order by lower(name) limit 80', [uid]),
    listDrafts(uid, talkId),
    getProfile(uid),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const ctx = [
    `\n\nToday is ${today}.`,
    prof.name ? `Their name is ${prof.name}. Use it rarely, if at all.` : '',
    prof.intention ? `What they told us they most want to preserve: "${prof.intention}". Let it guide which details you ask about; don't quote it back.` : '',
    prof.home ? `They consider home to be: ${prof.home}.` : '',
    planted.length
      ? `Already in their garden (id | place | when | moment):\n${planted
          .slice(-40)
          .map((m) => `- ${m.id} | ${m.place} | ${m.when ?? m.date ?? ''} | ${m.moment}`)
          .join('\n')}`
      : 'Their garden is empty so far.',
    people.length ? `People they keep: ${people.map((p) => p.name).join(', ')}.` : '',
    drafts.length
      ? `Drafted in this conversation (id | status | title | place):\n${drafts.map((d) => `- ${d.id} | ${d.status} | ${d.data.title} | ${d.data.place}`).join('\n')}`
      : '',
    talk.trip ? `This trip is titled "${talk.trip.title}".` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const tools = {
    draftMemory: tool({
      description: 'Draft one distinct memory from the conversation for the person to review. Not saved until they confirm it.',
      inputSchema: draftSchema,
      execute: async (input, { toolCallId }) => {
        const id = await upsertDraft(uid, talkId, toolCallId, input);
        return { drafted: true, draftId: id };
      },
    }),
    ...(talk.mode === 'trip'
      ? {
          nameTrip: tool({
            description: 'Name the trip this conversation is about, once you know where (and if possible when) it was.',
            inputSchema: tripSchema,
            execute: async (input) => {
              await nameTrip(uid, talkId, input);
              return { named: true };
            },
          }),
        }
      : {}),
  };

  const result = streamText({
    model,
    system: SYSTEM + (talk.mode === 'trip' ? TRIP : '') + ctx,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
  });

  return result.toUIMessageStreamResponse({
    onError: () => 'The reply didn’t come through. Nothing was lost — try again, or write the memory yourself.',
  });
}
