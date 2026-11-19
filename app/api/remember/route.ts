import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { memorySchema } from '@/lib/memory';
import { mockModel } from '@/lib/mock-model';
import { currentUser } from '@/lib/server/auth';
import { listMemories, plantMemory as keep } from '@/lib/server/data';
import { ConfigError } from '@/lib/server/db';

export const maxDuration = 30;

const MAX_MESSAGES = 40; // keep long sessions affordable
const MAX_CHARS = 1200; // per message the person sends

const SYSTEM = `You are the guide in What Stayed, a garden where travel memories become blossoms on a tree.

The person tells you about places they have been. Your job is to draw out one clear, specific moment from a place, then plant it.

How you speak:
- One or two short sentences. Never more than 30 words.
- Ask one question at a time. Calm, precise and curious, like a good museum guide or an editor. Not sentimental, not effusive, no therapy language.
- Ask about concrete, visual details: what they saw, the light, the weather, the sounds, who was there, what was happening.
- Don't tell them how they feel or comment on how meaningful something is.
- No lists, no headings, no emoji, no markdown. Plain sentences only.
- Never give travel advice, recommendations or facts about places. This is about their memory, not the destination.
- Never invent details. Use only what they told you.

When to plant:
- Once they have shared a specific moment (a place plus at least one concrete detail), call plantMemory.
- Write "moment" in their own words as much as you can, one short line.
- "feeling" is one plain word for the moment, taken from what they said ("calm", "busy", "bright").
- Weight: "light" for most memories, "tender" for quieter or more personal ones, "heavy" only for a memory they say matters a great deal.
- Plant one memory per moment. Do not plant the same moment twice.
- If a memory is clearly connected to one you planted earlier (the same person, a place they returned to, or a link they draw themselves), set echoes to that earlier place. The person decides whether to tie a red thread, so use it rarely.
- After planting, confirm it in a few words, then ask about another place or moment.

Care:
- If something painful comes up, acknowledge it briefly and plainly, do not probe, and let them choose whether to continue.
- If they want to talk about something unrelated, briefly bring it back to places and moments.`;

/** The tool writes straight to this person's garden, keyed by the call id so it is never planted twice. */
const plantFor = (userId: string) =>
  tool({
    description:
      'Plant one memory on the tree as a blossom. Call this once the person has shared a specific moment from a place.',
    inputSchema: memorySchema,
    execute: async (input, { toolCallId }) => {
      await keep(userId, toolCallId, input, 'agent');
      return { planted: true, id: toolCallId };
    },
  });

function pickModel(): LanguageModel | null {
  if (process.env.WHATSTAYED_MOCK === '1') return mockModel();
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return anthropic(process.env.WHATSTAYED_MODEL || 'claude-sonnet-5-5');
}

export async function POST(req: Request) {
  let user;
  try {
    user = await currentUser();
  } catch (e) {
    if (e instanceof ConfigError) return Response.json({ error: e.message }, { status: 503 });
    throw e;
  }
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') || req.headers.get('host'))) {
    return Response.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const model = pickModel();
  if (!model) {
    return Response.json({ error: 'The garden is resting.' }, { status: 503 });
  }

  let body: { messages?: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  if (!messages.length) return Response.json({ error: 'Nothing to remember yet' }, { status: 400 });

  // Trim anything overly long the person pasted in.
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const part of m.parts) {
      if (part.type === 'text' && part.text.length > MAX_CHARS) part.text = part.text.slice(0, MAX_CHARS);
    }
  }

  // The agent sees what is already planted (including memories added or edited by hand), so echoes stay honest.
  const planted = await listMemories(user.id);
  const known = planted.length
    ? `\n\nAlready planted in this garden (place: moment):\n${planted
        .slice(-30)
        .map((m) => `- ${String(m.place)}: ${String(m.moment)}`)
        .join('\n')}`
    : '';

  const result = streamText({
    model,
    system: SYSTEM + known,
    messages: convertToModelMessages(messages),
    tools: { plantMemory: plantFor(user.id) },
    stopWhen: stepCountIs(3),
    maxOutputTokens: 300,
  });

  return result.toUIMessageStreamResponse();
}
