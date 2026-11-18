'use client';

import { CSSProperties, memo, useEffect, useMemo, useRef } from 'react';
import { growTree, VIEW, type Limb as LimbT } from '@/lib/tree';
import type { Memory } from '@/lib/memory';

type Props = {
  memories: Memory[];
  threads: readonly (readonly [number, number])[];
  selected: number | null;
  onSelect: (i: number | null) => void;
};

const PETALS = [0, 72, 144, 216, 288];
const OPEN = 2.6; // seconds for the tree to finish drawing itself

// deterministic 0..1 noise
const hash = (n: number) => ((Math.sin(n * 12.9898 + 4.1414) * 43758.5453) % 1 + 1) % 1;

/** warm charcoal for the trunk, fading to muted warm gray at the twigs */
function branchColor(depth: number) {
  const t = Math.min(1, depth / 7);
  const a = [0x77, 0x73, 0x6e];
  const b = [0xb7, 0xb2, 0xaa];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** how much each limb sways, in degrees: trunk still, twigs freer */
const SWAY = [0, 0.22, 0.4, 0.62, 0.9, 1.25, 1.6, 1.9];

function Tree({ memories, threads, selected, onSelect }: Props) {
  const { root, tips } = useMemo(() => growTree(), []);
  const svgRef = useRef<SVGSVGElement>(null);

  // Blossoms saved from before wait for the tree to open; new ones unfold right away.
  const born = useRef<number | null>(null);
  if (born.current === null && typeof performance !== 'undefined') born.current = performance.now();
  const age = born.current === null ? 0 : (performance.now() - born.current) / 1000;
  const waits = useRef(new Map<number, number>());
  memories.forEach((_, i) => {
    if (!waits.current.has(i)) waits.current.set(i, Math.max(0, OPEN - age + 0.35 + i * 0.22));
  });

  // which limb tip carries which memories
  const byLimb = useMemo(() => {
    const m = new Map<number, number[]>();
    memories.forEach((_, i) => {
      const t = tips[i % tips.length];
      m.set(t.limb, [...(m.get(t.limb) || []), i]);
    });
    return m;
  }, [memories, tips]);



  // Keep each red thread tied to its two blossoms while the branches move.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !threads.length) return;
    let raf = 0;
    const tick = () => {
      const inv = svg.getScreenCTM()?.inverse();
      if (inv) {
        for (const [a, b] of threads) {
          const pa = svg.querySelector<SVGCircleElement>(`[data-anchor="${a}"]`);
          const pb = svg.querySelector<SVGCircleElement>(`[data-anchor="${b}"]`);
          const path = svg.querySelector<SVGPathElement>(`[data-thread="${a}-${b}"]`);
          const ma = pa?.getScreenCTM();
          const mb = pb?.getScreenCTM();
          if (!ma || !mb || !path) continue;
          const A = new DOMPoint(0, 0).matrixTransform(ma).matrixTransform(inv);
          const B = new DOMPoint(0, 0).matrixTransform(mb).matrixTransform(inv);
          const sag = Math.min(140, 40 + Math.hypot(B.x - A.x, B.y - A.y) * 0.22);
          const mx = (A.x + B.x) / 2;
          const my = Math.max(A.y, B.y) + sag;
          path.setAttribute('d', `M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [threads]);

  function blossom(i: number, x: number, y: number, angle: number) {
    const m = memories[i];
    const isSel = selected === i;
    const wait = waits.current.get(i) ?? 0;
    const size = m.weight === 'heavy' ? 1.04 : m.weight === 'tender' ? 1 : 0.94;
    const tint = m.weight === 'heavy' ? 'url(#pCherry)' : m.weight === 'tender' ? 'url(#pRose)' : 'url(#pBlush)';
    const tilt = (angle * 180) / Math.PI + 90 + (hash(i + 3) - 0.5) * 40;
    return (
      <g
        key={`b${i}`}
        className={`blossom w-${m.weight}${isSel ? ' is-sel' : ''}`}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(0)}) scale(${size})`}
        role="button"
        tabIndex={0}
        aria-label={`${m.place}: ${m.moment}`}
        aria-pressed={isSel}
        onClick={() => onSelect(isSel ? null : i)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(isSel ? null : i);
          }
        }}
        style={{ '--wait': `${wait.toFixed(2)}s` } as CSSProperties}
      >
        <circle className="hit" r="28" />
        <circle data-anchor={i} r="0.1" fill="none" />
        {PETALS.map((a, k) => (
          <g key={a} transform={`rotate(${a + (hash(i * 5 + k) - 0.5) * 10})`}>
            <path
              className="petal"
              d="M0 0 C -11 -6, -14 -22, -6 -30 Q 0 -27 0 -29 Q 0 -27 6 -30 C 14 -22, 11 -6, 0 0 Z"
              fill={tint}
              style={{ '--k': k, '--d': `${(5 + hash(i + k) * 4).toFixed(2)}s` } as CSSProperties}
            />
          </g>
        ))}
        <circle className="heart" r="4.4" />
        {[0, 52, 104, 156, 208, 260, 312].map((a, k) => (
          <g key={a} className="stamen" transform={`rotate(${a})`} style={{ '--k': k } as CSSProperties}>
            <line y1="-3" y2={-9 - hash(i + a) * 3} />
            <circle cy={-9.5 - hash(i + a) * 3} r="1.1" />
          </g>
        ))}
        {isSel && <circle className="sel-ring" r="38" />}
      </g>
    );
  }

  function limb(n: LimbT): React.ReactNode {
    const sways = n.depth >= 1 && n.depth <= 6;
    // the breeze travels across the crown from left to right
    const wave = (n.x / VIEW.w) * 3.2;
    const style = sways
      ? ({
          transformOrigin: `${n.x.toFixed(1)}px ${n.y.toFixed(1)}px`,
          '--a': `${(SWAY[n.depth] * (0.75 + hash(n.id) * 0.5)).toFixed(3)}deg`,
          animationDuration: `${(6.5 + hash(n.id + 1) * 4.5).toFixed(2)}s`,
          animationDelay: `${(-wave - hash(n.id + 2) * 4).toFixed(2)}s`,
        } as CSSProperties)
      : undefined;
    const carries = byLimb.get(n.id);
    return (
      <g key={n.id} className={sways ? 'limb' : undefined} style={style}>
        <path
          className="br"
          d={n.d}
          pathLength={1}
          stroke={branchColor(n.depth)}
          strokeWidth={n.w}
          style={{
            animationDelay: `${(0.2 + n.depth * 0.27 + hash(n.id + 9) * 0.16).toFixed(2)}s`,
            animationDuration: `${(n.depth === 0 ? 0.9 : 0.8 - n.depth * 0.05).toFixed(2)}s`,
          }}
        />
        {n.kids.map((k) => limb(k))}
        {!n.kids.length && !carries && (
          <circle className="bud" cx={n.x2} cy={n.y2} r={1.5} style={{ animationDelay: `${(2.2 + hash(n.id) * 0.6).toFixed(2)}s` }} />
        )}
        {carries?.map((i, k) => blossom(i, n.x2 + k * 10, n.y2 - k * 8, n.angle))}
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="tree"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`A tree with ${memories.length} ${memories.length === 1 ? 'blossom' : 'blossoms'}`}
    >
      <defs>
        <radialGradient id="pBlush" cx="50%" cy="100%" r="100%">
          <stop offset="0" stopColor="#efc9cf" />
          <stop offset=".55" stopColor="#f8e7e8" />
          <stop offset="1" stopColor="#fdf8f6" />
        </radialGradient>
        <radialGradient id="pRose" cx="50%" cy="100%" r="100%">
          <stop offset="0" stopColor="#c98a95" />
          <stop offset=".5" stopColor="#e6c2c6" />
          <stop offset="1" stopColor="#f8eceb" />
        </radialGradient>
        <radialGradient id="pCherry" cx="50%" cy="100%" r="100%">
          <stop offset="0" stopColor="#8f3a48" />
          <stop offset=".45" stopColor="#c27f88" />
          <stop offset="1" stopColor="#efdcdc" />
        </radialGradient>
        <radialGradient id="mist" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#e7e5df" stopOpacity=".95" />
          <stop offset="1" stopColor="#e7e5df" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f6e9e8" stopOpacity=".8" />
          <stop offset=".6" stopColor="#f6f2ee" stopOpacity=".35" />
          <stop offset="1" stopColor="#f8f7f3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className="halo" cx={VIEW.w / 2} cy={VIEW.h * 0.38} rx="430" ry="290" fill="url(#halo)" />
      <ellipse className="ground" cx={VIEW.w / 2} cy={VIEW.h - 36} rx="380" ry="28" fill="url(#mist)" />

      <g className="threads" aria-hidden="true">
        {threads.map(([a, b]) => (
          <path key={`${a}-${b}`} data-thread={`${a}-${b}`} className="thread" />
        ))}
      </g>

      {limb(root)}
    </svg>
  );
}

export default memo(Tree);
