/**
 * A seeded weeping willow: the same tree every visit, so memories keep their place.
 * A slender leaning trunk, limbs that leave it at different heights, and long strands that cascade from the limbs. Each strand carries
 * fine leaves and many tiny florets; some end in a hanging cluster, like wisteria. Memories hang on
 * the strands as larger blossoms. Nothing here is data; the memories are placed by Tree.tsx.
 */

export const VIEW = { w: 1000, h: 720 };

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

export type Pt = { x: number; y: number };
export type Floret = { x: number; y: number; r: number; tone: number; order: number; rot: number };
export type Leaf = { x: number; y: number; a: number; l: number };
export type Slot = { strand: number; x: number; y: number; t: number };
export type Strand = {
  id: number;
  ox: number; // where it hangs from (it sways around this point)
  oy: number;
  d: string;
  pts: Pt[];
  leaves: Leaf[];
  florets: Floret[];
  /** a hanging cluster at the end of the strand */
  cluster: Floret[];
  sway: number; // degrees
  dur: number; // seconds
  delay: number;
  depth: number; // 0 = back, 1 = front
};
export type Willow = { trunk: string; trunkLight: string; limbs: { d: string; w: number }[]; strands: Strand[]; slots: Slot[]; ground: Floret[]; total: number };

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};
const f = (n: number) => n.toFixed(1);

export function growWillow(seed = 4127): Willow {
  const r = rng(seed);
  const base: Pt = { x: 500, y: 694 };
  // the trunk's centre line: it leans a little, then rises to where the crown begins
  const spine: [Pt, Pt, Pt, Pt] = [base, { x: 470, y: 600 }, { x: 428, y: 470 }, { x: 462, y: 352 }];
  const fork = spine[3];

  // the trunk: drawn around the centre line, flared at the root and slender at the top
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const p = bez(...spine, t);
    const q = bez(...spine, Math.min(1, t + 0.01));
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const w = 5 + 10 * (1 - t) + 9 * Math.pow(Math.max(0, 1 - t * 6), 2);
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  const trunk = `M${left.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')} L${right.reverse().map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')} Z`;
  const lit = left.slice(1, 20).map((p, k) => bez(...spine, (k + 1) / 24)).map((c, k) => ({ x: (c.x + left[k + 1].x) / 2, y: (c.y + left[k + 1].y) / 2 }));
  const trunkLight = `M${lit.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')}`;

  // limbs leave the trunk at different heights and arch outward; the left reaches further than the right
  const limbDefs = [
    { at: 0.6, to: { x: 140, y: 310 }, up: 70, w: 3 },
    { at: 0.71, to: { x: 205, y: 205 }, up: 115, w: 3.4 },
    { at: 0.84, to: { x: 318, y: 132 }, up: 150, w: 3.8 },
    { at: 0.97, to: { x: 438, y: 96 }, up: 170, w: 4 },
    { at: 1, to: { x: 562, y: 108 }, up: 160, w: 3.8 },
    { at: 0.9, to: { x: 672, y: 152 }, up: 135, w: 3.5 },
    { at: 0.78, to: { x: 768, y: 222 }, up: 105, w: 3.1 },
    { at: 0.66, to: { x: 846, y: 322 }, up: 66, w: 2.7 },
    // inner arcs fill the dome
    { at: 0.8, to: { x: 322, y: 252 }, up: 70, w: 2.2 },
    { at: 0.87, to: { x: 640, y: 256 }, up: 70, w: 2.2 },
  ];
  const limbs: { d: string; w: number }[] = [];
  const arcs: [Pt, Pt, Pt, Pt][] = [];
  for (const L of limbDefs) {
    const o = bez(...spine, L.at);
    const p0 = { x: o.x + (r() - 0.5) * 6, y: o.y };
    const p1 = { x: p0.x + (L.to.x - p0.x) * 0.2, y: p0.y - L.up };
    const p2 = { x: L.to.x - (L.to.x - p0.x) * 0.25, y: L.to.y - 40 };
    const p3 = { x: L.to.x, y: L.to.y + 34 };
    arcs.push([p0, p1, p2, p3]);
    limbs.push({ d: `M${f(p0.x)} ${f(p0.y)} C ${f(p1.x)} ${f(p1.y)}, ${f(p2.x)} ${f(p2.y)}, ${f(p3.x)} ${f(p3.y)}`, w: L.w });
  }

  // strands cascade from points along each limb's outer half
  const strands: Strand[] = [];
  let order = 0;
  const allFlorets: Floret[] = [];
  arcs.forEach((arc, li) => {
    const count = 11 + Math.floor(r() * 4);
    for (let k = 0; k < count; k++) {
      const t = 0.26 + (k / (count - 1)) * 0.74 + (r() - 0.5) * 0.04;
      const o = bez(...arc, Math.min(1, t));
      const outward = o.x < fork.x ? -1 : 1;
      // longer strands toward the crown's centre form the curtain; the outer ones are shorter
      const centre = 1 - Math.min(1, Math.abs(o.x - fork.x) / 430);
      const len = 210 + centre * 230 + r() * 70;
      const drift = outward * (16 + r() * 26);
      const end = { x: o.x + drift, y: Math.min(o.y + len, 655 - r() * 40) };
      const c1 = { x: o.x + outward * (10 + r() * 14), y: o.y + (end.y - o.y) * 0.25 };
      const c2 = { x: end.x - drift * 0.2, y: o.y + (end.y - o.y) * 0.7 };
      const pts: Pt[] = [];
      for (let s = 0; s <= 16; s++) pts.push(bez(o, c1, c2, end, s / 16));
      const leaves: Leaf[] = [];
      const florets: Floret[] = [];
      for (let s = 1; s < 16; s++) {
        const p = pts[s];
        const side = s % 2 ? 1 : -1;
        if (r() < 0.8) leaves.push({ x: p.x, y: p.y, a: 90 + side * (28 + r() * 22) + outward * 6, l: 7 + r() * 6 });
        if (s > 2 && r() < 0.86) {
          const fl = { x: p.x + side * (2 + r() * 5), y: p.y + (r() - 0.5) * 6, r: 2.2 + r() * 2.2, tone: Math.floor(r() * 4), order: 0, rot: r() * 72 };
          florets.push(fl);
          allFlorets.push(fl);
          // a few florets come in pairs, like a small spray
          if (r() < 0.3) {
            const fl2 = { x: fl.x - side * (3 + r() * 3), y: fl.y + 3 + r() * 3, r: 1.6 + r() * 1.4, tone: Math.floor(r() * 4), order: 0, rot: r() * 72 };
            florets.push(fl2);
            allFlorets.push(fl2);
          }
        }
      }
      // a hanging cluster (raceme) at the end of many strands: wide at the top, tapering down
      const cluster: Floret[] = [];
      if (r() < 0.72) {
        const h = 46 + r() * 60;
        const n = 18 + Math.floor(r() * 14);
        for (let c = 0; c < n; c++) {
          const ct = c / n;
          const w = (1 - ct * 0.85) * (11 + r() * 5);
          const fl = { x: end.x + (r() - 0.5) * 2 * w, y: end.y - h * 0.2 + ct * h, r: 3.4 - ct * 1.6 + r() * 0.9, tone: Math.floor(r() * 4), order: 0, rot: r() * 72 };
          cluster.push(fl);
          allFlorets.push(fl);
        }
      }
      strands.push({
        id: strands.length,
        ox: o.x,
        oy: o.y,
        d: `M${f(o.x)} ${f(o.y)} C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(end.x)} ${f(end.y)}`,
        pts,
        leaves,
        florets,
        cluster,
        sway: 0.6 + r() * 1.1 + centre * 0.4,
        dur: 6 + r() * 5,
        delay: -r() * 8,
        depth: li === 2 || li === 3 ? (k % 2) : 1,
      });
    }
  });

  // a carpet of tiny flowers at the foot of the tree
  const ground: Floret[] = [];
  for (let g = 0; g < 120; g++) {
    const gx = 180 + r() * 640;
    const spread = 1 - Math.abs(gx - 488) / 340;
    const fl = { x: gx, y: 690 + (r() - 0.3) * 24 * Math.max(0.3, spread), r: 1.4 + r() * 1.8, tone: Math.floor(r() * 4), order: 0, rot: r() * 72 };
    ground.push(fl);
    allFlorets.push(fl);
  }

  // the order in which florets open as the garden fills: a stable shuffle
  const idx = allFlorets.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  idx.forEach((fi, k) => (allFlorets[fi].order = k));
  order = allFlorets.length;

  // places where a memory can hang: along the lower part of each strand, spread across the crown
  const slots: Slot[] = [];
  strands.forEach((s) => {
    for (const t of [0.5, 0.72, 0.9]) {
      const i = Math.round(t * 16);
      slots.push({ strand: s.id, x: s.pts[i].x, y: s.pts[i].y, t });
    }
  });
  const sr = rng(seed * 7 + 3);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(sr() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  // the first slots favour the front and middle of the crown, so early memories are easy to see
  const key = new Map(slots.map((s) => [s, Math.abs(s.x - 488) / 500 + (s.t === 0.9 ? 0.2 : 0) + sr() * 0.9]));
  slots.sort((a, b) => key.get(a)! - key.get(b)!);

  return { trunk, trunkLight, limbs, strands, slots, ground, total: order };
}
