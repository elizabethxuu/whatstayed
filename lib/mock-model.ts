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
 * And, to exercise the agent's other tools for real:
 * - "what do you remember about X" / "memories with X" searches the garden and answers only from the results;
 * - "connect this to my X memories" searches, then proposes a red thread (confirmed by the person later);
 * - "delete my memory about X" searches, then proposes the deletion; with nothing to go on, it asks which;
 * - "what did I tell you about X" searches earlier conversations;
 * - "reflect…" counts themes, gathers memories and offers a reflection to keep;
 * - a tool error is reported as an error, never as success.
 * Real conversations use Claude with the same tools.
 */
type Part = { type: string; text?: string; toolName?: string; input?: unknown; output?: { type?: string; value?: unknown } | unknown };
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

type Result = { name: string; value: Record<string, unknown> };
const valueOf = (o: Part['output']): Record<string, unknown> => {
  const v = o && typeof o === 'object' && 'value' in (o as object) ? (o as { value: unknown }).value : o;
  return (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return { text: v }; } })() : v ?? {}) as Record<string, unknown>;
};
function topicOf(s: string) {
  const m = s.match(/\b(?:about|with|of|from|mentions?|mentioning|to)\s+(?:my\s+|the\s+)?(.+?)(?:\s+memories|\s+memory)?\s*[?.!]*$/i);
  return m ? m[1].trim().replace(/^(my|the)\s+/i, '') : '';
}
const call = (name: string, input: unknown, n: number): LanguageModelV2StreamPart => ({ type: 'tool-call', toolCallId: `${name}${n}${Date.now() % 100000}`, toolName: name, input: JSON.stringify(input) });
const callsDone = (parts: LanguageModelV2StreamPart[]): LanguageModelV2StreamPart[] => [...parts, { type: 'finish', finishReason: 'tool-calls', usage }];
const quoteMems = (ms: { moment: string; place: string; when?: string }[]) => ms.slice(0, 3).map((m) => `“${m.moment}” (${m.place}${m.when ? `, ${m.when}` : ''})`).join('; ');

/** The agent's non-capture intents, planned one step at a time from the tool results so far. */
function plan(said: string, results: Result[], focus: string | undefined, n: number): LanguageModelV2StreamPart[] | null {
  const got = (name: string) => results.find((r) => r.name === name)?.value;
  const failed = results.find((r) => r.value?.error);
  if (failed) return say(`That didn’t work: ${failed.value.error} Nothing was changed.`);
  const proposed = results.find((r) => r.name.startsWith('propose'))?.value;
  if (proposed) return say(`I’ve suggested it below: ${proposed.summary}. Nothing changes until you confirm.`);
  const topic = topicOf(said);

  if (/\b(what did i (tell|say)|i told you|i mentioned)\b/i.test(said)) {
    const r = got('recallConversations') as { found: number; excerpts: { date: string; theySaid: string }[] } | undefined;
    if (!r) return callsDone([call('recallConversations', { query: topic || said }, n)]);
    return say(r.found ? `On ${r.excerpts[0].date} you told me: “${r.excerpts[0].theySaid}”` : `I can’t find anything about ${topic || 'that'} in our earlier conversations.`);
  }
  if (/\b(delete|remove)\b/i.test(said)) {
    if (/\b(this|it)\b/i.test(said) && focus && !topic) return callsDone([call('proposeMemoryDeletion', { id: focus }, n)]);
    if (!topic) return say('Which memory do you mean? Tell me the place or a few words from it.');
    const r = got('searchMemories') as { memories: { id: string }[] } | undefined;
    if (!r) return callsDone([call('searchMemories', { query: topic }, n)]);
    if (!r.memories.length) return say(`I couldn’t find a memory about ${topic}, so nothing was deleted.`);
    return callsDone([call('proposeMemoryDeletion', { id: r.memories[0].id }, n)]);
  }
  if (/\b(connect|tie|link)\b.*\b(to|with|and)\b/i.test(said)) {
    const ids = said.match(/\bm[a-z0-9]{10,}\b/g) ?? []; // memory ids are long; "memories" is not one
    if (ids.length >= 1 && (ids.length >= 2 || focus)) return callsDone([call('proposeConnection', { a: ids.length >= 2 ? ids[0] : focus, b: ids[ids.length - 1], reason: 'You asked to tie them' }, n)]);
    if (!focus) return say('Which memory would you like to connect? Open it on the tree, then ask again.');
    if (!topic) return say('What should I connect it to? A place, a person or a trip.');
    const r = got('searchMemories') as { memories: { id: string; place: string }[] } | undefined;
    if (!r) return callsDone([call('searchMemories', { query: topic }, n)]);
    const other = r.memories.find((m) => m.id !== focus);
    if (!other) return say(`I couldn’t find another memory about ${topic} to connect it to.`);
    return callsDone([call('proposeConnection', { a: focus, b: other.id, reason: `You asked to connect it to ${topic}` }, n)]);
  }
  if (/\b(reflect|reflection|summari[sz]e)\b|\bthemes\b/i.test(said)) {
    const t = got('findThemes') as { memories: number; places: { name: string; count: number }[]; people: { name: string; count: number }[] } | undefined;
    const r = got('searchMemories') as { memories: { id: string; moment: string; place: string }[] } | undefined;
    if (!t || !r) return callsDone([call('findThemes', {}, n), call('searchMemories', { limit: 12 }, n + 1)]);
    if (!r.memories.length) return say('There’s nothing in the garden to reflect on yet. Tell me about a place first.');
    const body = [
      `${t.memories === 1 ? 'One memory is' : `${t.memories} memories are`} kept here.`,
      t.places.length ? `${t.places.map((p) => `${p.name} appears ${p.count} times`).join(', ')}.` : '',
      t.people.length ? `${t.people.map((p) => `${p.name} is in ${p.count}`).join(', ')}.` : '',
      `Among them: ${quoteMems(r.memories)}.`,
    ].filter(Boolean).join(' ');
    return callsDone([call('proposeReflection', { title: 'What the garden holds', body, memoryIds: r.memories.map((m) => m.id) }, n)]);
  }
  if (/\b(what do (you|i) remember|do i have|find|show me|memories (with|of|about|from)|anything about)\b/i.test(said)) {
    const r = got('searchMemories') as { total: number; memories: { moment: string; place: string; when?: string }[] } | undefined;
    if (!r) return callsDone([call('searchMemories', { query: topic || said }, n)]);
    return say(r.total ? `In your garden, ${topic}: ${quoteMems(r.memories)}. Would you like to open one?` : `I don’t have anything about ${topic || 'that'} in your garden yet. Would you like to tell me about it?`);
  }
  return null;
}

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
      const focus = system.match(/They have this memory open right now \("this memory"\): (\S+) \|/)?.[1];
      const lastUser = p.map((m) => m.role).lastIndexOf('user');
      const results: Result[] = p
        .slice(lastUser + 1)
        .filter((m) => m.role === 'tool')
        .flatMap((m) => (m.content as Part[]).map((c) => ({ name: c.toolName ?? '', value: valueOf(c.output) })));
      const capturing = results.some((r) => r.name === 'draftMemory' || r.name === 'nameTrip');
      const planned = capturing ? null : plan(said, results, focus, ++n);
      let chunks: LanguageModelV2StreamPart[];

      if (planned) {
        chunks = planned;
      } else if (last?.role === 'tool') {
        const results = (last.content as Part[]).map((c) => c.toolName);
        const made = results.filter((t) => t === 'draftMemory').length;
        // follow up on what they actually said: the drafts' own place, moment and people
        const callsMade = (p[p.length - 2]?.content as Part[] | string) ?? [];
        const inputs = (Array.isArray(callsMade) ? callsMade : [])
          .filter((c) => c.type === 'tool-call')
          .map((c) => { try { return (typeof c.input === 'string' ? JSON.parse(c.input) : c.input) as { title?: string; moment?: string; place?: string; people?: string[] }; } catch { return {}; } });
        const d0 = inputs.find((x) => x.moment) ?? {};
        const trip = inputs.find((x) => !x.moment && x.place) as { place?: string } | undefined;
        const lc = (t?: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '');
        chunks = say(
          made === 0
            ? `Who went with you to ${trip?.place ?? 'that place'}, and what do you remember first?`
            : made > 1
              ? `I’ve drafted those for you to look over. Of them, “${d0.title ?? d0.moment}”: ${d0.people?.length ? `what was ${d0.people[0]} doing just then?` : `who else was there in ${d0.place}?`}`
              : `Drafted. When you picture ${lc(d0.moment)} in ${d0.place}, what can you hear?`,
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
          : say(isTrip && !tripTitle ? 'Where did you go, and when was it?' : drafted.length ? `Is there more from ${drafted[drafted.length - 1].place}, or somewhere else you want to keep?` : 'Where were you? Start with the place, and one thing you remember about it.');
      }
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 20 }) };
    },
  });
}
