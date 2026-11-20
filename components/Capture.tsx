'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AddMemory from './AddMemory';
import Flower from './Flower';
import { useStoreApi } from '@/lib/store';
import { preparePhoto } from '@/lib/media';
import type { HandDraft } from '@/lib/draft';

type Open = { initial?: HandDraft; photos?: Blob[] } | null;

const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

const ACTIONS: { key: string; title: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'story', title: 'Tell a story', hint: 'Talk it through; it drafts the memories for you', icon: <path d="M4.5 6.5h15v9h-7l-4.5 3.5v-3.5h-3.5z" /> },
  { key: 'voice', title: 'Record a voice memory', hint: 'Speak, and read it back before it’s sent', icon: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></> },
  { key: 'write', title: 'Write something', hint: 'A page in your Journal', icon: <><path d="M6 3.8h9.2L18.5 7v13.2H6z" /><path d="M9 10.5h6.5M9 13.5h6.5M9 16.5h4" /></> },
  { key: 'photos', title: 'Add photographs', hint: 'Choose them, then say what you remember', icon: <><rect x="3.8" y="5.5" width="16.4" height="13" rx="2" /><circle cx="9" cy="10.4" r="1.6" /><path d="M4.5 17l5-4.5 3.5 3 2.5-2 4 3.5" /></> },
  { key: 'place', title: 'Save a place', hint: 'Somewhere you want to remember', icon: <><path d="M12 20.5s-6-5.6-6-10.2a6 6 0 0 1 12 0c0 4.6-6 10.2-6 10.2z" /><circle cx="12" cy="10.3" r="2.2" /></> },
  { key: 'moment', title: 'Capture a moment', hint: 'One line is enough', icon: <><circle cx="12" cy="12" r="3.4" /><path d="M12 3.8v2.2M12 18v2.2M3.8 12H6M18 12h2.2" /></> },
];

/**
 * The floating capture control: one tap opens a sheet of the ways to keep something,
 * and each opens its own short workflow, right here or one step away.
 */
export default function Capture() {
  const store = useStoreApi();
  const router = useRouter();
  const path = usePathname();
  const [sheet, setSheet] = useState(false);
  const [adding, setAdding] = useState<Open>(null);
  const file = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheet) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  function choose(key: string) {
    haptic();
    if (key === 'photos') {
      // the file picker must open inside this tap
      file.current?.click();
      setSheet(false);
      return;
    }
    setSheet(false);
    // a fresh load, so a new conversation starts even from inside the garden
    if (key === 'story') window.location.assign('/?talk=new');
    else if (key === 'voice') window.location.assign('/?talk=new&voice=1');
    else if (key === 'write') router.push('/archives?new=1');
    else if (key === 'place') setAdding({ initial: { step: 1, weight: 'light' } });
    else setAdding({ initial: { step: 0, weight: 'light' } });
  }

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files || [])].slice(0, 12);
    e.target.value = '';
    if (!files.length) return;
    const ready: Blob[] = [];
    for (const f of files) {
      try {
        ready.push(await preparePhoto(f));
      } catch (err) {
        store.toast(err instanceof Error ? err.message : 'That photograph couldn’t be used.', 'error');
      }
    }
    if (ready.length) setAdding({ initial: { step: 0, weight: 'light' }, photos: ready });
  }

  // the conversation page has its own way to speak and write; there the button sits a little higher
  const onGarden = path === '/';
  return (
    <>
      <button
        type="button"
        className={`capture-fab${onGarden ? ' high' : ''}${sheet ? ' open' : ''}`}
        aria-label="Keep something"
        aria-haspopup="dialog"
        aria-expanded={sheet}
        onClick={() => {
          haptic();
          setSheet((v) => !v);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={onPhotos} />

      {sheet && (
        <div className="sheet-veil capture-veil" onClick={() => setSheet(false)}>
          <section className="capture-sheet" role="dialog" aria-modal="true" aria-labelledby="capT" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <header className="capture-head">
              <Flower size={26} />
              <h2 id="capT">Something worth keeping?</h2>
            </header>
            <ul className="capture-list">
              {ACTIONS.map((a, k) => (
                <li key={a.key} style={{ '--k': k } as React.CSSProperties}>
                  <button type="button" ref={k === 0 ? first : undefined} onClick={() => choose(a.key)}>
                    <span className="capture-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {a.icon}
                      </svg>
                    </span>
                    <span className="capture-text">
                      <span className="capture-title">{a.title}</span>
                      <span className="capture-hint">{a.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="quiet capture-close" onClick={() => setSheet(false)}>
              Not now
            </button>
          </section>
        </div>
      )}

      {adding && (
        <AddMemory
          initial={adding.initial}
          initialPhotos={adding.photos}
          onClose={() => setAdding(null)}
          onPlanted={(id) => {
            setAdding(null);
            store.toast('Saved. Some things stay.');
            router.push(`/memory/${id}`);
          }}
        />
      )}
    </>
  );
}
