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

const SYSTEM = `You are the quiet voice of What Stayed, a garden where travel memories grow into blossoms on a tree.

The person tells you about places they have been. Your job is to help them find the moment that stayed with them, then plant it.

How you speak:
- One or two short sentences. Never more than 35 words.
- Ask one question at a time. Warm, unhurried, curious. Like a friend across a small table.
- Ask about the senses and the small things: a smell, a sound, who was there, what the light was like, what they did with their hands.
- No lists, no headings, no emoji, no markdown. Plain sentences only.
- Never give travel advice, recommendations or facts about places. This is about their memory, not the destination.
- Never invent details. Use only what they told you.

When to plant:
- Once they have shared a specific moment (a place plus at least one concrete detail), call plantMemory.
- Write "moment" in their own words as much as you can, one short line.
- Plant one memory per moment. Do not plant the same moment twice.
- If a memory is meaningfully connected to one you planted earlier (the same person, a place they returned to, or a link they draw themselves), set echoes to that earlier place. This draws a red thread between them, so use it rarely and only for real connections.
- After planting, say one short line that lets the memory settle, then gently ask about another moment, from this trip or another place.

Care:
- If something painful comes up, slow down. Acknowledge it simply, do not probe, and let them choose whether to go on. Plant it as "heavy" only if they want to keep it.
- If they want to talk about something unrelated, kindly bring it back to the places and moments that stayed with them.`;

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
