import { simulateReadableStream } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';

/**
 * A scripted stand-in for Claude, used only when WHATSTAYED_MOCK=1, so the conversation can be
 * tested and previewed without an API key. It is deliberately simple and predictable:
 * - in a trip conversation, the first place it hears names the trip;
 * - each clause that describes something done or seen ("walking…", "I bought…") becomes its own draft;
 * - "Actually…" corrects the most recent draft;
 * - a place already in the garden is suggested as a connection;
 * - "that's all" / "I'm done" ends with a pointer to the review.
 * Real conversations use Claude with the same tools.
 */
type Part = { type: string; text?: string; toolName?: string; input?: unknown };
type Prompt = { role: string; content: string | Part[] }[];

const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 };

function textOf(m?: Prompt[number]) {
  if (!m) return '';
  return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(' ').trim();
}

function say(text: string): LanguageModelV2StreamPart[] {
  const words = text.split(' ');
  return [
    { type: 'text-start', id: 't' },
    ...words.map((w, i) => ({ type: 'text-delta' as const, id: 't', delta: (i ? ' ' : '') + w })),
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: 'stop', usage },
  ];
}

const MONTH = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|last (?:spring|summer|autumn|fall|winter|year|January|February|March|April|May|June|July|August|September|October|November|December)|summer \d{4}|\d{4})\b/i;
const DOING = /\b(walk|walking|walked|find|finding|found|spend|spending|spent|bought|buy|ate|eating|saw|watched|swam|swimming|sat|heard|climbed|danced|met|took|drank|cooked|stayed in|got lost|held|rode|laughed|braided|played|sang|read|wrote|ringing)\b/i;
const SENSE = /\b(rain|smell|sound|light|wooden|cold|warm|bells|music|steam|snow|sea|wind)\b[^,.;]*/gi;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function dateOf(when: string | undefined, today: string): { date?: string; unsure?: boolean } {
  if (!when) return {};
  const y = when.match(/\d{4}/)?.[0];
  const mi = MONTHS.findIndex((m) => when.toLowerCase().includes(m));
  if (y && mi >= 0) return { date: `${y}-${String(mi + 1).padStart(2, '0')}` };
  if (y) return { date: y };
  if (mi >= 0 && /last/i.test(when)) {
    const [ty, tm] = today.split('-').map(Number);
    const year = mi + 1 < tm ? ty : ty - 1;
    return { date: `${year}-${String(mi + 1).padStart(2, '0')}`, unsure: true };
  }
  return {};
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function mockModel() {
  let n = 0;
  return new MockLanguageModelV2({
    doStream: async ({ prompt }) => {
      const p = prompt as unknown as Prompt;
      const system = p.filter((m) => m.role === 'system').map(textOf).join('\n');
      const isTrip = system.includes('This conversation is about one trip');
      const tripTitle = system.match(/This trip is titled "([^"]+)"/)?.[1];
      const today = system.match(/Today is (\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
      const drafted = [...system.matchAll(/^- (\S+) \| draft \| (.+?) \| (.+)$/gm)].map((m) => ({ id: m[1], title: m[2], place: m[3] }));
      const garden = [...system.matchAll(/^- (m\S+) \| ([^|]+) \|/gm)].map((m) => ({ id: m[1], place: m[2].trim() }));
      const last = p[p.length - 1];
      const said = textOf([...p].reverse().find((m) => m.role === 'user'));
      let chunks: LanguageModelV2StreamPart[];

      if (last?.role === 'tool') {
        const results = (last.content as Part[]).map((c) => c.toolName);
        const made = results.filter((t) => t === 'draftMemory').length;
        const onlyNamed = made === 0;
        chunks = say(
          onlyNamed
            ? 'Who were you with, and what do you remember most?'
            : made > 1
              ? 'I’ve drafted those for you to look over. Do you remember what drew you to the first one?'
              : 'Drafted. What else do you remember about it, or was there somewhere else?',
        );
      } else if (/\b(that's all|that’s all|i'm done|i’m done|nothing else|finish)\b/i.test(said)) {
        chunks = say('Thank you. Your memories are ready to review whenever you are.');
      } else {
        const calls: LanguageModelV2StreamPart[] = [];
        const PLACE = (w: string) => new RegExp(`\\b(?:${w})\\s+((?:the\\s+)?[A-Z][\\w'’-]+(?:\\s+[A-Z][\\w'’-]+)?)`);
        const placeSaid = said.match(PLACE('in|at'))?.[1] || said.match(PLACE('to'))?.[1];
        const when = said.match(MONTH)?.[0];
        if (isTrip && !tripTitle && placeSaid) {
          calls.push({ type: 'tool-call', toolCallId: `trip${++n}`, toolName: 'nameTrip', input: JSON.stringify({ title: when ? `${placeSaid}, ${cap(when.replace(/^last /i, ''))}` : placeSaid, place: placeSaid, when }) });
        }
        const place = placeSaid || tripTitle?.split(',')[0] || drafted[drafted.length - 1]?.place || 'Somewhere';
        const people = [...said.matchAll(/\bwith (my \w+|[A-Z][a-z]+)/g)].map((m) => m[1]);
        const { date, unsure } = dateOf(when, today);
        if (/^actually\b/i.test(said) && drafted.length) {
          const d = drafted[drafted.length - 1];
          calls.push({ type: 'tool-call', toolCallId: `c${++n}${Date.now() % 100000}`, toolName: 'draftMemory', input: JSON.stringify({ replaces: d.id, title: d.title, moment: cap(said.replace(/^actually,?\s*/i, '')), place: d.place, weight: 'light', ...(people.length ? { people } : {}) }) });
        } else {
          const clauses = said
            .split(/[.;!?]|,\s*(?:and\s+)?|\band then\b/)
            .map((s) => s.trim())
            .filter((s) => s.length > 8 && DOING.test(s));
          clauses.slice(0, 4).forEach((c, i) => {
            const same = garden.find((g) => g.place.toLowerCase() === place.toLowerCase());
            const moment = cap(c.replace(/^(and|then|i remember|i)\s+/i, ''));
            const input = {
              title: cap(moment.split(' ').slice(0, 5).join(' ').replace(/[,]$/, '')),
              moment,
              place,
              ...(when ? { when } : {}),
              ...(date ? { date } : {}),
              ...(people.length ? { people } : {}),
              ...((c.match(SENSE) || []).length ? { senses: (c.match(SENSE) || []).map((s) => s.trim()) } : {}),
              weight: 'light',
              ...(unsure ? { unsure: ['date'] } : {}),
              ...(same && i === 0 ? { related: [{ id: same.id, reason: `Also in ${same.place}` }] } : {}),
            };
            calls.push({ type: 'tool-call', toolCallId: `c${++n}${Date.now() % 100000}${i}`, toolName: 'draftMemory', input: JSON.stringify(input) });
          });
        }
        chunks = calls.length
          ? [...calls, { type: 'finish', finishReason: 'tool-calls', usage }]
          : say(isTrip && !tripTitle ? 'Where did you go, and when was it?' : 'What do you see when you picture it? The light, the weather, who was there?');
      }
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 20 }) };
    },
  });
}
