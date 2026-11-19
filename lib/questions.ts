/**
 * Questions written for one person, from what they have actually kept and told us:
 * their memories (places, moments, who was there, when), the people they keep, their home,
 * what they said they want to preserve, how they like to remember, and dates that come round again.
 *
 * Nothing here is invented: every name, place and phrase in a question comes from their own records.
 * A question only ever asks; it never states a feeling or a fact about them.
 * The order is stable for a day (so "today's question" doesn't change on reload) and differs per person.
 */

export type QMemory = { id: string; place: string; moment: string; when?: string; date?: string; createdAt: number; extra?: { title?: string; senses?: string[]; objects?: string[] } };
export type QInput = {
  seed: string; // something stable and private to the person, e.g. their account email
  profile: { name?: string; home?: string; intention?: string; remember?: string[]; ways?: string[] };
  memories: QMemory[];
  people: { id: string; name: string }[];
  /** memory id → names of people tied to it */
  with: Record<string, string[]>;
  /** memory id → city, when the memory has a mapped place */
  city: Record<string, string | undefined>;
  /** questions already answered (their text), most recent first */
  answered: string[];
};
export type Question = { text: string; about?: { kind: 'memory' | 'person' | 'place'; id?: string; label: string }; weight: number };

/** a short, quotable name for a memory, in their own words */
export function short(m: QMemory) {
  const t = (m.extra?.title || m.moment).trim().replace(/[.!?…]+$/, '');
  const words = t.split(/\s+/);
  return words.length > 8 ? words.slice(0, 7).join(' ') + '…' : t;
}

/** a small stable hash, so each person gets their own order */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T,>(xs: T[], n: number) => xs[n % xs.length];

export function questionsFor(input: QInput, today: Date): Question[] {
  const { profile: p, memories, people } = input;
  const out: Question[] = [];
  const add = (text: string, weight: number, about?: Question['about']) => {
    if (!out.some((q) => q.text === text)) out.push({ text, weight, about });
  };
  const daySeed = `${input.seed}|${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const md = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  /* a date that has come round again: the strongest reason for a question today */
  for (const m of memories) {
    if (!m.date || m.date.length < 10 || m.date.slice(5) !== md || +m.date.slice(0, 4) >= today.getFullYear()) continue;
    const years = today.getFullYear() - +m.date.slice(0, 4);
    add(`${years === 1 ? 'A year ago today' : `${years} years ago today`}: “${short(m)}”, in ${m.place}. What do you remember now that you didn’t write down then?`, 100, { kind: 'memory', id: m.id, label: short(m) });
  }

  /* memories: older ones first, and ones with little kept about them yet */
  const byAge = [...memories].sort((a, b) => a.createdAt - b.createdAt);
  byAge.forEach((m, i) => {
    const s = `“${short(m)}”`;
    const who = input.with[m.id] ?? [];
    const place = input.city[m.id] || m.place;
    const thin = !(m.extra?.senses?.length || m.extra?.objects?.length);
    const n = hash(daySeed + m.id);
    const forms: [string, number][] = [
      [`When you picture ${s} in ${place}, what can you hear?`, thin ? 12 : 6],
      [`What happened just after ${s}?`, 8],
      [`What were you carrying with you that day in ${place}?`, thin ? 9 : 5],
      [`If you could stand inside ${s} again for one minute, where would you look first?`, 7],
    ];
    if (who.length) forms.push([`What was ${who[0]} doing, just outside the frame of ${s}?`, 10]);
    else forms.push([`Who else was there for ${s}, even in the background?`, 9]);
    if (m.when) forms.push([`What else was happening in your life around ${m.when}, when ${s} happened?`, 8]);
    const [text, w] = pick(forms, n);
    add(text, w + Math.max(0, 6 - i), { kind: 'memory', id: m.id, label: short(m) });
  });

  /* places they return to */
  const counts = new Map<string, number>();
  memories.forEach((m) => {
    const c = input.city[m.id] || m.place;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  for (const [place, k] of counts) {
    if (k >= 2) add(`You’ve kept ${k} memories in ${place}. Which one comes back first?`, 11, { kind: 'place', label: place });
    else add(pick([`What did ${place} smell like?`, `What was the light like in ${place}?`, `How did you get to ${place}, and who did you go with?`], hash(daySeed + place)), 5, { kind: 'place', label: place });
  }

  /* the people they keep */
  for (const person of people) {
    const n = hash(daySeed + person.id);
    add(
      pick(
        [`What is something ${person.name} used to say?`, `Where were you the last time you saw ${person.name}?`, `What would you show ${person.name} if they were here today?`, `What did ${person.name}’s voice sound like when they laughed?`],
        n,
      ),
      9,
      { kind: 'person', id: person.id, label: person.name },
    );
  }

  /* what they told us about themselves */
  if (p.home) add(`What does ${p.home} look like at this time of year?`, 6);
  if (p.intention) add(`You wanted to keep “${p.intention.replace(/[.!?]+$/, '')}”. What is one small piece of it from this week?`, 10);
  const r = new Set([...(p.remember ?? []), ...(p.ways ?? [])]);
  if (r.has('chapters')) add('If this year of your life were a chapter, what would its title be?', 6);
  if (r.has('little')) add('What small thing have you kept the longest, and where is it now?', 7);
  if (r.has('moments')) add('What is a moment that quietly changed the direction of things?', 6);
  if (r.has('people') && !people.length) add('Who do you not want to forget? Start with their name.', 8);
  if (r.has('places') && !memories.length) add('Which place have you been thinking about lately?', 8);
  if (r.has('photos')) add('Which photograph on your phone would you save first, and what happened just before it was taken?', 6);
  if (r.has('reflections') || r.has('writing')) add('What did you notice today that you’d usually walk past?', 5);

  /* never empty: a first question for a brand-new garden */
  if (!out.length) add('Where were you the last time you felt completely at ease?', 1);

  /* questions answered recently go to the back */
  const recent = new Set(input.answered.slice(0, 30));
  return out
    .map((q) => ({ q, k: q.weight * 1000 + (hash(daySeed + q.text) % 1000) - (recent.has(q.text) ? 1_000_000 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.q);
}
