'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { itemsOf, mediaFor, mediaUrl, memoriesOfPage, peopleOf, useStore } from '@/lib/store';
import { locLine, placeTitle } from '@/lib/places';
import { coverOf } from './Collections';

/** The look of the printed edition. Also embedded in the downloaded web page, so both match. */
const DOC_CSS = `
.print-doc{--ink:#33312f;--soft:#78736d;--faint:#a8a39c;--thread:#9e2f3c;max-width:720px;margin:0 auto;padding:72px 48px 96px;color:var(--ink);background:#fbfaf7;font-family:'Cormorant Garamond','Iowan Old Style',Palatino,Georgia,serif}
.print-doc .pd-mark{font-style:italic;font-size:16px;color:var(--soft);margin:0 0 120px}
.print-doc .pd-cover{width:100%;max-height:520px;object-fit:cover;display:block;margin:0 0 48px;filter:saturate(.9)}
.print-doc h1{font-weight:400;font-size:64px;line-height:1;letter-spacing:-.015em;margin:0}
.print-doc .pd-desc{font-style:italic;font-size:22px;color:var(--soft);margin:18px 0 0}
.print-doc .pd-meta{font:500 9.5px/1.4 Inter,-apple-system,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--faint);margin:28px 0 0}
.print-doc .pd-item{break-before:page;page-break-before:always;padding-top:64px}
.print-doc .pd-k{font:500 9.5px/1.5 Inter,-apple-system,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--soft);margin:0 0 18px}
.print-doc .pd-moment{font-style:italic;font-size:34px;line-height:1.3;margin:0}
.print-doc .pd-body{font-size:20px;line-height:1.7;white-space:pre-wrap;margin:0}
.print-doc .pd-sub{font-size:17px;color:var(--soft);margin:18px 0 0}
.print-doc .pd-thread{font-style:italic;font-size:16px;color:var(--thread);margin:10px 0 0}
.print-doc .pd-photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:36px 0 0}
.print-doc .pd-photos img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.print-doc .pd-photos img:only-child{grid-column:1/-1;aspect-ratio:auto;max-height:560px}
.print-doc .pd-end{break-before:page;page-break-before:always;padding-top:240px;text-align:center;font-style:italic;color:var(--faint);font-size:18px}
@media print{.print-doc{padding:0;background:#fff;max-width:none}.print-doc .pd-mark{margin-bottom:80px}}
`;

export default function PrintCollection() {
  const [snap, store] = useStore();
  const cid = useSearchParams().get('c') || '';
  const c = snap.collections.find((x) => x.id === cid);
  const [busy, setBusy] = useState('');

  if (!c)
    return (
      <main className="welcome">
        <div className="welcome-card">
          <p className="welcome-sub">That collection isn’t here any more.</p>
          <Link className="quiet" href="/collections">← Collections</Link>
        </div>
      </main>
    );

  const items = itemsOf(snap, c.id);
  const cover = coverOf(snap, c);
  const dateOf = (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  /** One self-contained .html file: the same pages, with every photograph inside it. */
  async function download() {
    const doc = document.querySelector('.print-doc');
    if (!doc) return;
    setBusy('Gathering photographs…');
    try {
      const clone = doc.cloneNode(true) as HTMLElement;
      const imgs = [...clone.querySelectorAll('img')];
      for (let i = 0; i < imgs.length; i++) {
        setBusy(`Gathering photographs… ${i + 1} of ${imgs.length}`);
        const r = await fetch(imgs[i].getAttribute('src') || '', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('A photograph couldn’t be fetched. Nothing was downloaded.');
        const b = await r.blob();
        const data = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = rej;
          fr.readAsDataURL(b);
        });
        imgs[i].setAttribute('src', data);
        imgs[i].removeAttribute('loading');
      }
      const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c!.name)} · What Stayed</title><style>body{margin:0;background:#fbfaf7}${DOC_CSS}@media (max-width:600px){.print-doc{padding:40px 20px}.print-doc h1{font-size:44px}}</style></head><body>${clone.outerHTML}</body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${c!.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'collection'}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      store.toast('Your collection is downloading.');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'That didn’t work.', 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="print">
      <style>{DOC_CSS}</style>
      <nav className="print-bar" aria-label="Printed edition">
        <Link className="quiet" href={`/collections?c=${encodeURIComponent(c.id)}`}>
          ← Back
        </Link>
        <span />
        <button type="button" className="quiet strong" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button type="button" className="quiet" onClick={download} disabled={!!busy}>
          {busy || 'Download as a web page'}
        </button>
      </nav>

      <article className="print-doc">
        <p className="pd-mark">What Stayed</p>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pd-cover" src={mediaUrl(cover.id)} alt="" />
        )}
        <h1>{c.name}</h1>
        {c.description && <p className="pd-desc">{c.description}</p>}
        <p className="pd-meta">
          {items.length} {items.length === 1 ? 'piece' : 'pieces'} · gathered {dateOf(Date.now())}
        </p>

        {items.map((it) => {
          if (it.kind === 'memory') {
            const m = it.m!;
            const loc = snap.locations[m.id];
            const ppl = peopleOf(snap, 'memory-person', m.id);
            const photos = mediaFor(snap, 'memory', m.id).filter((x) => x.kind === 'photo');
            return (
              <section key={'m' + m.id} className="pd-item">
                <p className="pd-k">{[loc ? locLine(loc) : m.place, m.when || (m.date ? dateOf(new Date(m.date + 'T12:00:00').getTime()) : '')].filter(Boolean).join(' · ')}</p>
                <p className="pd-moment">“{m.moment}”</p>
                <p className="pd-sub">
                  {m.feeling}
                  {ppl.length ? ` · with ${ppl.map((p) => p.name).join(', ')}` : ''}
                </p>
                {snap.threads
                  .filter((t) => t.a === m.id || t.b === m.id)
                  .map((t) => {
                    const o = snap.memories.find((x) => x.id === (t.a === m.id ? t.b : t.a));
                    return o ? (
                      <p key={t.id} className="pd-thread">
                        Tied to {snap.locations[o.id] ? placeTitle(snap.locations[o.id]) : o.place}
                        {t.note ? `: ${t.note}` : ''}
                      </p>
                    ) : null;
                  })}
                {photos.length > 0 && (
                  <div className="pd-photos">
                    {photos.slice(0, 6).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={mediaUrl(p.id)} alt="" />
                    ))}
                  </div>
                )}
              </section>
            );
          }
          const e = it.e!;
          const ppl = peopleOf(snap, 'entry-person', e.id);
          const photos = mediaFor(snap, 'entry', e.id).filter((x) => x.kind === 'photo');
          return (
            <section key={'e' + e.id} className="pd-item">
              <p className="pd-k">{[dateOf(e.createdAt), e.location ? locLine(e.location) : ''].filter(Boolean).join(' · ')}</p>
              <p className="pd-body">{e.body.trim()}</p>
              {ppl.length > 0 && <p className="pd-sub">With {ppl.map((p) => p.name).join(', ')}</p>}
              {memoriesOfPage(snap, e.id).map(({ m, note }) => (
                <p key={m.id} className="pd-thread">
                  Tied to {m.place}
                  {note ? `: ${note}` : ''}
                </p>
              ))}
              {photos.length > 0 && (
                <div className="pd-photos">
                  {photos.slice(0, 6).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={mediaUrl(p.id)} alt="" />
                  ))}
                </div>
              )}
            </section>
          );
        })}
        <p className="pd-end">What stayed.</p>
      </article>
    </main>
  );
}
