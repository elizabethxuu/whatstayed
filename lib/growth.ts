/**
 * How the willow grows. Everything here is derived from what is saved in the database:
 * memories (confirmed and saved; drafts and AI suggestions never count), the places they
 * happened, and the connections between them (red threads and the people in them).
 *
 * There is no decay, no streak and nothing to lose by stepping away: the tree only reflects
 * what has been kept. (If a memory is deleted, it is no longer part of the archive, so the
 * tree is drawn without it.)
 *
 * Growth points =   3 × memories preserved
 *                 + 2 × places remembered      (distinct places, by city or place name)
 *                 + 1 × connections discovered  (red threads + a person linked to a memory)
 *
 * The stage depends on memories alone, so the tree only grows when something is kept.
 */

export type StageKey = 'seed' | 'sprout' | 'young' | 'growing' | 'mature' | 'perennial';

export const STAGES: { key: StageKey; from: number; name: string; line: string }[] = [
  { key: 'seed', from: 0, name: 'A seed', line: 'Every garden begins somewhere. Tell me one thing you remember.' },
  { key: 'sprout', from: 1, name: 'A sprout', line: 'Your garden is growing. Every memory leaves something behind.' },
  { key: 'young', from: 3, name: 'A young willow', line: 'The first branches. A little more of your story, preserved.' },
  { key: 'growing', from: 8, name: 'A growing willow', line: 'The strands are lengthening. Every memory adds another leaf.' },
  { key: 'mature', from: 20, name: 'A mature willow', line: 'Your willow is beginning to flourish.' },
  { key: 'perennial', from: 50, name: 'A perennial willow', line: 'A canopy of memory. Some things stay.' },
];

export function stageOf(memories: number) {
  let k = 0;
  STAGES.forEach((s, i) => memories >= s.from && (k = i));
  const now = STAGES[k];
  const next = STAGES[k + 1];
  // how far along to the next stage, 0..1 (the last stage is always whole)
  const toNext = next ? (memories - now.from) / (next.from - now.from) : 1;
  return { ...now, index: k, next, toNext: Math.max(0, Math.min(1, toNext)) };
}

/**
 * The shape of the tree for a number of memories: one continuous curve, so each memory
 * moves it a little rather than switching between pictures.
 */
export function shapeFor(memories: number) {
  const m = Math.max(0, memories);
  const ease = (x: number, k: number) => 1 - Math.exp(-Math.max(0, x) / k);
  // the willow itself appears with the third memory and keeps filling out after
  const tree = m >= 3;
  const scale = tree ? 0.34 + 0.66 * ease(m - 3, 16) : 0; // size of trunk, limbs and strands
  const reach = tree ? 0.14 + 0.86 * ease(m - 3, 13) : 0; // share of strands that have grown
  const limbs = tree ? Math.min(10, 3 + Math.round(7 * ease(m - 3, 9))) : 0; // arching limbs drawn
  // a close view while it is small, drawing back as it grows (applied around the root)
  const zoom = m === 0 ? 4.2 : m === 1 ? 3.4 : m < 3 ? 3 : Math.max(1, Math.pow(scale, -0.6));
  // tiny florets that have opened; the canopy keeps filling long after the tree is grown
  const florets = tree ? Math.round(m * 16 + Math.max(0, m - 20) * 10) : 0;
  const carpet = m >= 8; // a few fallen blossoms at the foot of the tree
  // a young trunk is slender; it thickens as the tree matures
  const girth = tree ? 0.5 + 0.5 * ease(m - 3, 22) : 0;
  return { tree, scale, reach, limbs, zoom, florets, carpet, girth };
}

type Mem = { id: string; place: string; createdAt: number };
type Snap = {
  memories: Mem[];
  threads: { createdAt: number }[];
  links: { kind: string; createdAt?: number }[];
  locations: Record<string, { city?: string } | undefined>;
  plantedAt?: number;
};

export function growth(s: Snap) {
  const memories = s.memories.length;
  const places = new Set(s.memories.map((m) => (s.locations[m.id]?.city || m.place || '').trim().toLowerCase()).filter(Boolean)).size;
  const people = s.links.filter((l) => l.kind === 'memory-person').length;
  const connections = s.threads.length + people;
  const points = 3 * memories + 2 * places + connections;
  const stage = stageOf(memories);
  return { memories, places, connections, points, stage };
}

/** The growth journey, read from when things were actually saved. */
export function journey(s: Snap) {
  const byAge = [...s.memories].sort((a, b) => a.createdAt - b.createdAt);
  const out: { at: number; text: string }[] = [];
  if (s.plantedAt) out.push({ at: s.plantedAt, text: 'The seed was planted.' });
  if (byAge[0]) out.push({ at: byAge[0].createdAt, text: `The first memory: ${byAge[0].place}. A sprout appeared.` });
  if (byAge[1]) out.push({ at: byAge[1].createdAt, text: 'A second memory, and the first blossom opened.' });
  for (const st of STAGES.slice(2)) {
    const m = byAge[st.from - 1];
    if (m) out.push({ at: m.createdAt, text: `${st.name}, with memory number ${st.from}.` });
  }
  const firstThread = [...s.threads].sort((a, b) => a.createdAt - b.createdAt)[0];
  if (firstThread) out.push({ at: firstThread.createdAt, text: 'The first red thread tied two memories together.' });
  return out.sort((a, b) => a.at - b.at);
}
