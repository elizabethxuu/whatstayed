'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { mediaFor, mediaUrl, useStore, type Media } from '@/lib/store';
import { clock, pickRecorderType, preparePhoto } from '@/lib/media';
import { confirmSheet } from '@/lib/confirm';

const MAX_MS = 5 * 60 * 1000;

type Owner = { type: Media['ownerType']; id: string };

/** Photographs and voice notes kept with a memory or a page. */
export default function MediaShelf({ owner, compact = false }: { owner: Owner; compact?: boolean }) {
  const [snap, store] = useStore();
  const items = mediaFor(snap, owner.type, owner.id);
  const photos = items.filter((m) => m.kind === 'photo');
  const voices = items.filter((m) => m.kind === 'voice');
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<Media | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    for (let i = 0; i < files.length; i++) {
      setBusy(files.length > 1 ? `Keeping photograph ${i + 1} of ${files.length}…` : 'Uploading…');
      try {
        const blob = await preparePhoto(files[i]);
        await store.addMedia(owner, 'photo', blob);
      } catch (err) {
        store.toast(err instanceof Error ? err.message : 'That photo couldn’t be uploaded.', 'error');
      }
    }
    setBusy('');
  }

  async function onAudio(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return store.toast('That recording is too large (4 MB at most).', 'error');
    setBusy('Uploading…');
    await store.addMedia(owner, 'voice', f);
    setBusy('');
  }

  async function remove(m: Media) {
    if (!(await confirmSheet(m.kind === 'photo' ? { title: 'Remove this photograph?', yes: 'Remove', danger: true } : { title: 'Delete this recording?', body: 'This can’t be undone.', yes: 'Delete recording', danger: true }))) return;
    setView(null);
    await store.deleteMedia(m.id);
  }

  return (
    <div className={`shelf${compact ? ' compact' : ''}`}>
      {photos.length > 0 && (
        <ul className="shelf-photos" aria-label="Photographs">
          {photos.map((m, i) => (
            <li key={m.id}>
              <button type="button" onClick={() => setView(m)} aria-label={`Open photograph ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(m.id)} alt="" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {voices.length > 0 && (
        <ul className="shelf-voices" aria-label="Voice notes">
          {voices.map((m, i) => (
            <li key={m.id}>
              <audio controls preload="none" src={mediaUrl(m.id)} aria-label={`Voice note ${i + 1}`} />
              <span className="shelf-len">{m.durationMs ? clock(m.durationMs) : ''}</span>
              <button type="button" className="untie" onClick={() => remove(m)} aria-label={`Delete voice note ${i + 1}`}>
                delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="shelf-acts">
        <button type="button" className="quiet" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          Add a photograph
        </button>
        <Recorder owner={owner} disabled={!!busy} onAudioFile={() => audioRef.current?.click()} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPhotos} />
        <input ref={audioRef} type="file" accept="audio/*" hidden onChange={onAudio} />
      </div>
      {busy && (
        <p className="shelf-busy" role="status">
          {busy}
        </p>
      )}

      {view && <Lightbox m={view} onClose={() => setView(null)} onRemove={() => remove(view)} />}
    </div>
  );
}

function Lightbox({ m, onClose, onRemove }: { m: Media; onClose: () => void; onRemove: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="loc-veil light" onClick={onClose} role="dialog" aria-modal="true" aria-label="Photograph">
      <figure className="lightbox" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(m.id)} alt="" />
        <figcaption>
          <span>{new Date(m.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <button type="button" className="quiet danger" onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="quiet" onClick={onClose} autoFocus>
            Close
          </button>
        </figcaption>
      </figure>
    </div>
  );
}

/** Asks before touching the microphone, records only while asked, never in the background. */
function Recorder({ owner, disabled, onAudioFile }: { owner: Owner; disabled: boolean; onAudioFile: () => void }) {
  const [, store] = useStore();
  const [phase, setPhase] = useState<'idle' | 'ask' | 'rec' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(!!navigator.mediaDevices?.getUserMedia && pickRecorderType() !== null), []);

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      const r = rec.current;
      if (r && r.state !== 'inactive') {
        r.onstop = null;
        r.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase('idle');
      store.toast('The microphone wasn’t available, so nothing was recorded. You can choose an audio file instead.', 'error');
      return;
    }
    const type = pickRecorderType() || undefined;
    const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tick.current) clearInterval(tick.current);
      const ms = Date.now() - started.current;
      const blob = new Blob(chunks.current, { type: (r.mimeType || 'audio/webm').split(';')[0] });
      if (!blob.size || ms < 500) {
        setPhase('idle');
        store.toast('That recording was too short.', 'error');
        return;
      }
      setPhase('saving');
      await store.addMedia(owner, 'voice', blob, ms);
      setPhase('idle');
    };
    rec.current = r;
    started.current = Date.now();
    setElapsed(0);
    r.start(1000);
    setPhase('rec');
    tick.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= MAX_MS && r.state === 'recording') r.stop();
    }, 250);
  }

  function stop() {
    if (rec.current && rec.current.state === 'recording') rec.current.stop();
  }

  function cancel() {
    const r = rec.current;
    if (r && r.state !== 'inactive') {
      r.onstop = null;
      r.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    }
    if (tick.current) clearInterval(tick.current);
    setPhase('idle');
  }

  if (phase === 'ask')
    return (
      <div className="loc-ask rec-ask" role="group" aria-label="Record a voice note">
        <p>Your browser will ask to use the microphone. It records only while you see the timer, and the note is kept with this {owner.type === 'memory' ? 'memory' : 'page'}.</p>
        <button type="button" className="quiet strong" onClick={start}>
          Start recording
        </button>
        <button type="button" className="quiet" onClick={() => setPhase('idle')}>
          Not now
        </button>
      </div>
    );
  if (phase === 'rec')
    return (
      <span className="rec-on" role="status">
        <i aria-hidden="true" />
        Recording {clock(elapsed)}
        <button type="button" className="quiet strong" onClick={stop}>
          Stop and keep
        </button>
        <button type="button" className="quiet" onClick={cancel}>
          Discard
        </button>
      </span>
    );
  if (phase === 'saving') return <span className="shelf-busy">Keeping the recording…</span>;
  return (
    <>
      {supported && (
        <button type="button" className="quiet" onClick={() => setPhase('ask')} disabled={disabled}>
          Record a voice note
        </button>
      )}
      <button type="button" className="quiet" onClick={onAudioFile} disabled={disabled}>
        {supported ? 'or add an audio file' : 'Add a voice recording'}
      </button>
    </>
  );
}
