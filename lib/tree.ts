/**
 * A seeded, deterministic tree: the same branches every visit, so blossoms keep their place.
 * Limbs are nested, so a twig moves with the branch it grows from, plus its own sway.
 */

export type Limb = {
  id: number;
  depth: number;
  w: number;
  x: number; // base, where it pivots
  y: number;
  x2: number; // tip
  y2: number;
  angle: number;
  d: string;
  kids: Limb[];
  /** fine twiglets appear only once the garden holds this many memories */
  later?: number;
};

export type Tip = { x: number; y: number; angle: number; limb: number };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VIEW = { w: 1000, h: 720 };

export function growTree(seed = 2590) {
  const r = rng(seed);
  const tips: Tip[] = [];
  let next = 0;

  function grow(x: number, y: number, angle: number, len: number, width: number, depth: number): Limb {
    const bend = (r() - 0.5) * (depth < 2 ? 0.16 : 0.42);
    const a2 = angle + bend;
    const x2 = x + Math.cos(a2) * len;
    const y2 = y + Math.sin(a2) * len;
    const cx = x + Math.cos(angle) * len * 0.55;
    const cy = y + Math.sin(angle) * len * 0.55;
    const limb: Limb = {
      id: next++,
      depth,
      w: width,
      x,
      y,
      x2,
      y2,
      angle: a2,
      d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      kids: [],
    };

    if (depth >= 7 || len < 14) {
      tips.push({ x: x2, y: y2, angle: a2, limb: limb.id });
      return limb;
    }
    const kids = depth < 2 ? 2 : r() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = 0.38 + r() * 0.32;
      const dir = kids === 3 ? (k - 1) * spread : (k === 0 ? -1 : 1) * spread * (depth < 2 ? 1 : 0.7 + r() * 0.6);
      const lift = depth > 3 ? -0.08 : 0; // the crown lifts and widens, like a cherry tree
      limb.kids.push(grow(x2, y2, a2 + dir + lift, len * (0.7 + r() * 0.14), Math.max(0.35, width * 0.63), depth + 1));
    }
    return limb;
  }

  const root = grow(VIEW.w / 2, VIEW.h - 40, -Math.PI / 2, 150, 11, 0);

  // Fine twiglets at the outer tips, from their own seed so the tree's shape never shifts.
  // Each waits for a number of memories, so the crown grows more intricate as the garden fills.
  const r2 = rng(seed * 31 + 7);
  const leaves: Limb[] = [];
  (function walk(l: Limb) {
    if (!l.kids.length) leaves.push(l);
    l.kids.forEach(walk);
  })(root);
  for (const l of leaves) {
    if (l.y2 > VIEW.h - 240) continue;
    const n = r2() < 0.55 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const a = l.angle + (k === 0 ? -1 : 1) * (0.35 + r2() * 0.5);
      const len = 9 + r2() * 13;
      const bx = l.x + (l.x2 - l.x) * (0.55 + r2() * 0.35);
      const by = l.y + (l.y2 - l.y) * (0.55 + r2() * 0.35);
      const x2 = bx + Math.cos(a) * len;
      const y2 = by + Math.sin(a) * len;
      l.kids.push({
        id: next++, depth: 8, w: 0.3, x: bx, y: by, x2, y2, angle: a,
        d: `M${bx.toFixed(1)} ${by.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`,
        kids: [], later: 1 + Math.floor(r2() * 18),
      });
    }
  }

  // Order the tips so blossoms spread across the crown instead of filling one side first.
  const crown = tips.filter((t) => t.y < VIEW.h - 220);
  const order = crown
    .map((t, i) => ({ t, k: rng(i * 7919 + 13)() }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.t);

  return { root, tips: order, allTips: tips };
}
