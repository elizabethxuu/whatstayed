'use client';

import { useMemo, useRef } from 'react';
import { growTree, VIEW } from '@/lib/tree';
import type { Memory } from '@/lib/memory';

type Props = {
  memories: Memory[];
  selected: number | null;
  onSelect: (i: number | null) => void;
};

const PETALS = [0, 72, 144, 216, 288];

export default function Tree({ memories, selected, onSelect }: Props) {
  const { branches, tips } = useMemo(() => growTree(), []);
  // The tree opens over ~3s. Blossoms already saved wait for it; new ones bloom right away.
  const born = useRef<number | null>(null);
  if (born.current === null && typeof performance !== 'undefined') born.current = performance.now();
  const age = born.current === null ? 0 : (performance.now() - born.current) / 1000;
  const OPEN = 2.9;
  const jitter = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

  return (
    <svg className="tree" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`A tree with ${memories.length} ${memories.length === 1 ? 'blossom' : 'blossoms'}`}>
      <defs>
        <radialGradient id="petal" cx="50%" cy="85%" r="90%">
          <stop offset="0" stopColor="#f3c3cf" />
          <stop offset=".45" stopColor="#fae3e9" />
          <stop offset="1" stopColor="#fffdfb" />
        </radialGradient>
        <radialGradient id="petalTender" cx="50%" cy="85%" r="90%">
          <stop offset="0" stopColor="#e9a3b4" />
          <stop offset=".5" stopColor="#f6d5de" />
          <stop offset="1" stopColor="#fff8f8" />
        </radialGradient>
        <radialGradient id="mist" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#e9ecec" stopOpacity=".9" />
          <stop offset="1" stopColor="#e9ecec" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fbe6ec" stopOpacity=".75" />
          <stop offset=".55" stopColor="#fdf3f1" stopOpacity=".35" />
          <stop offset="1" stopColor="#fbfaf7" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" />
        </filter>
      </defs>

      <ellipse className="halo" cx={VIEW.w / 2} cy={VIEW.h * 0.4} rx="420" ry="300" fill="url(#halo)" />
      <ellipse className="ground" cx={VIEW.w / 2} cy={VIEW.h - 34} rx="360" ry="30" fill="url(#mist)" />

      <g className="sway">
      <g className="branches">
        {branches.map((b, i) => (
          <path
            key={i}
            d={b.d}
            pathLength={1}
            strokeWidth={b.w}
            style={{
              animationDelay: `${(0.25 + b.depth * 0.3 + jitter(i) * 0.18).toFixed(2)}s`,
              animationDuration: `${(b.depth === 0 ? 1.1 : 0.95 - b.depth * 0.06).toFixed(2)}s`,
              opacity: 0.78 - b.depth * 0.07,
            }}
          />
        ))}
      </g>

      <g className="buds" aria-hidden="true">
        {tips.map((t, i) =>
          i < memories.length ? null : (
            <circle key={i} cx={t.x} cy={t.y} r={1.6} style={{ animationDelay: `${(2.3 + jitter(i + 7) * 0.7).toFixed(2)}s` }} />
          ),
        )}
      </g>

      <g className="blossoms">
        {memories.map((m, i) => {
          const t = tips[i % tips.length];
          const ring = Math.floor(i / tips.length);
          const x = t.x + ring * 9;
          const y = t.y - ring * 7;
          const scale = m.weight === 'heavy' ? 1.05 : m.weight === 'tender' ? 1 : 0.92;
          const isSel = selected === i;
          const wait = Math.max(0, OPEN - age + i * 0.18);
          return (
            <g
              key={i}
              className={`blossom w-${m.weight}${isSel ? ' is-sel' : ''}`}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((t.angle * 180) / Math.PI + 90).toFixed(0)})`}
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
            >
              {m.weight === 'heavy' && (
                <path className="thread" d="M0 6 C 8 34, -8 58, 3 92" fill="none" />
              )}
              <g className="bloom" style={{ transform: `scale(${scale})`, animationDelay: `${wait.toFixed(2)}s` }}>
                <circle className="hit" r="28" />
                {PETALS.map((a) => (
                  <ellipse
                    key={a}
                    rx="12.5"
                    ry="17"
                    cy="-14.5"
                    transform={`rotate(${a})`}
                    fill={m.weight === 'light' ? 'url(#petal)' : 'url(#petalTender)'}
                    filter="url(#soft)"
                  />
                ))}
                <circle r="4.6" className="heart" />
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <circle key={a} r="1.2" cx={Math.cos((a * Math.PI) / 180) * 8} cy={Math.sin((a * Math.PI) / 180) * 8} className="anther" />
                ))}
              </g>
              {isSel && <circle className="sel-ring" r="34" />}
            </g>
          );
        })}
      </g>
      </g>
    </svg>
  );
}
