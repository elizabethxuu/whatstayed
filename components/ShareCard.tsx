'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaFor, mediaUrl, useStore, type Stored } from '@/lib/store';
import { placeTitle } from '@/lib/places';

const W = 1080;
const H = 1350;

/** wrap text to a width, at most `max` lines, with an ellipsis if it runs over */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > width && line) {
      lines.push(line);
      line = w;
      if (lines.length === max) break;
    } else line = t;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(' ').length > lines.join(' ').length) lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, '') + '…';
  return lines;
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  for (let k = 0; k < 5; k++) {
    ctx.save();
    ctx.rotate((k * 72 * Math.PI) / 180);
    const g = ctx.createLinearGradient(0, 0, 0, -13);
    g.addColorStop(0, '#5b86e0');
    g.addColorStop(1, '#dbe7ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-4.6, -2.2, -6.2, -8.6, -3.2, -11.4);
    ctx.bezierCurveTo(-1.6, -12.8, 1.6, -12.8, 3.2, -11.4);
    ctx.bezierCurveTo(6.2, -8.6, 4.6, -2.2, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe59a';
  ctx.beginPath();
  ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A card made from one memory, drawn here in the browser. Nothing is uploaded and no link is created:
 * the person chooses what's on it, then shares or saves the image themselves.
 */
export default function ShareCard({ m, onClose }: { m: Stored; onClose: () => void }) {
  const [snap, store] = useStore();
  const photo = mediaFor(snap, 'memory', m.id).find((x) => x.kind === 'photo');
  const [opt, setOpt] = useState({ photo: !!photo, place: true, when: !!(m.when || m.date), story: false, reflection: '' });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      try {
        await Promise.all([document.fonts.load('300 80px "Cormorant Garamond"'), document.fonts.load('italic 400 40px "Cormorant Garamond"')]);
      } catch {
        /* fall back to the system serif */
      }
      // the night garden
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0c1636');
      bg.addColorStop(1, '#08102a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const moon = ctx.createRadialGradient(W * 0.82, 120, 10, W * 0.82, 120, 420);
      moon.addColorStop(0, 'rgba(160,190,255,.35)');
      moon.addColorStop(1, 'rgba(160,190,255,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, W, H);
      let y = 140;
      if (opt.photo && photo) {
        const img = new Image();
        img.src = mediaUrl(photo.id);
        try {
          await img.decode();
          const ph = 620;
          const r = Math.max((W - 160) / img.width, ph / img.height);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(80, 110, W - 160, ph, 36);
          ctx.clip();
          ctx.drawImage(img, 80 + (W - 160 - img.width * r) / 2, 110 + (ph - img.height * r) / 2, img.width * r, img.height * r);
          ctx.restore();
          y = 110 + ph + 90;
        } catch {
          /* the photograph couldn't be drawn; the card goes on without it */
        }
      } else {
        flower(ctx, W / 2, 330, 9);
        y = 560;
      }
      if (cancelled) return;
      ctx.textAlign = 'left';
      const label = [opt.place ? (snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place) : '', opt.when ? m.when || m.date || '' : ''].filter(Boolean).join('  ·  ');
      if (label) {
        ctx.fillStyle = '#9fb4e6';
        ctx.font = '500 26px -apple-system, "Inter", sans-serif';
        ctx.fillText(label.toUpperCase().split('').join(String.fromCharCode(8202)), 90, y);
        y += 70;
      }
      ctx.fillStyle = '#f2f6ff';
      ctx.font = '300 74px "Cormorant Garamond", Georgia, serif';
      for (const line of wrap(ctx, m.extra?.title || m.moment, W - 180, 3)) {
        ctx.fillText(line, 90, y);
        y += 82;
      }
      const more = opt.reflection.trim() || (opt.story ? m.extra?.narrative || (m.extra?.title ? m.moment : '') : '');
      if (more) {
        y += 14;
        ctx.fillStyle = '#c9d6f5';
        ctx.font = 'italic 400 40px "Cormorant Garamond", Georgia, serif';
        for (const line of wrap(ctx, more, W - 180, 5)) {
          ctx.fillText(line, 90, y);
          y += 54;
        }
      }
      flower(ctx, 108, H - 92, 1.9);
      ctx.fillStyle = '#dbe7ff';
      ctx.font = '400 34px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('What Stayed', 140, H - 80);
      if (!cancelled) setUrl(c.toDataURL('image/png'));
    })();
    return () => {
      cancelled = true;
    };
  }, [opt, m, photo, snap.locations]);

  async function share() {
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'what-stayed.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: m.extra?.title || m.moment });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = 'what-stayed.png';
    a.click();
    store.toast('Saved as an image. Share it however you like.');
  }

  return (
    <div className="sheet-veil" onClick={onClose}>
      <section className="add share-sheet" role="dialog" aria-modal="true" aria-labelledby="shT" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <h2 id="shT" className="add-title">A card to share</h2>
        <p className="you-note">Made here, on your device. Nothing is uploaded and no link is created; only what you choose is on the card.</p>
        <div className="share-body">
          <canvas ref={canvas} width={W} height={H} className="sr" />
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="share-preview" src={url} alt="Preview of the card" />
          ) : (
            <p className="share-preview share-wait">Drawing the card…</p>
          )}
          <div className="share-opts">
            {photo && (
              <label className="ob-check">
                <input type="checkbox" checked={opt.photo} onChange={(e) => setOpt({ ...opt, photo: e.target.checked })} /> The photograph
              </label>
            )}
            <label className="ob-check">
              <input type="checkbox" checked={opt.place} onChange={(e) => setOpt({ ...opt, place: e.target.checked })} /> Where
            </label>
            {(m.when || m.date) && (
              <label className="ob-check">
                <input type="checkbox" checked={opt.when} onChange={(e) => setOpt({ ...opt, when: e.target.checked })} /> When
              </label>
            )}
            {(m.extra?.narrative || m.extra?.title) && (
              <label className="ob-check">
                <input type="checkbox" checked={opt.story} onChange={(e) => setOpt({ ...opt, story: e.target.checked })} /> A little of the story
              </label>
            )}
            <label className="rv-field">
              <span>Or a short reflection, just for this card</span>
              <textarea rows={2} maxLength={220} value={opt.reflection} onChange={(e) => setOpt({ ...opt, reflection: e.target.value })} />
            </label>
          </div>
        </div>
        <footer className="add-foot">
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
          <span className="add-foot-r">
            <button type="button" className="welcome-go" onClick={share} disabled={!url}>
              Share the card
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}
