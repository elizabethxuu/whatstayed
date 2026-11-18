/** A seeded, deterministic tree: the same branches every visit, so blossoms keep their place. */

export type Branch = { d: string; w: number; depth: number; len: number };
export type Tip = { x: number; y: number; angle: number };

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
  const branches: Branch[] = [];
  const tips: Tip[] = [];

  function grow(x: number, y: number, angle: number, len: number, width: number, depth: number) {
    // a gently curved limb
    const bend = (r() - 0.5) * (depth < 2 ? 0.16 : 0.42);
    const a2 = angle + bend;
    const x2 = x + Math.cos(a2) * len;
    const y2 = y + Math.sin(a2) * len;
    const cx = x + Math.cos(angle) * len * 0.55;
    const cy = y + Math.sin(angle) * len * 0.55;
    branches.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, w: width, depth, len });

    if (depth >= 7 || len < 14) {
      tips.push({ x: x2, y: y2, angle: a2 });
      return;
    }
    const kids = depth < 2 ? 2 : r() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = 0.38 + r() * 0.32;
      const dir = kids === 3 ? (k - 1) * spread : (k === 0 ? -1 : 1) * spread * (depth < 2 ? 1 : 0.7 + r() * 0.6);
      // branches lean outward and slightly upward, like a cherry tree's wide crown
      const lift = depth > 3 ? -0.08 : 0;
      grow(x2, y2, a2 + dir + lift, len * (0.7 + r() * 0.14), Math.max(0.7, width * 0.66), depth + 1);
    }
  }

  grow(VIEW.w / 2, VIEW.h - 40, -Math.PI / 2, 150, 20, 0);

  // Order the tips so blossoms spread across the crown instead of filling one side first.
  const crown = tips.filter((t) => t.y < VIEW.h - 220);
  const order = crown
    .map((t, i) => ({ t, k: rng(i * 7919 + 13)() }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.t);

  return { branches, tips: order };
}
