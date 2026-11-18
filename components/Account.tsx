'use client';

import { FormEvent, useState } from 'react';
import Masthead from './Masthead';
import { api, mediaUrl, useStore, type Media } from '@/lib/store';
import { zip } from '@/lib/zip';

const ext: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function Account({ email }: { email: string }) {
  const [snap, store] = useStore();
  const [exporting, setExporting] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function exportAll() {
    setExporting('Gathering everything…');
    try {
      const data = await api<{ media: Media[] }>('/api/export');
      const files: { name: string; data: Uint8Array }[] = [];
      const named = data.media.map((m, i) => ({ ...m, file: `media/${String(i + 1).padStart(3, '0')}-${m.kind}.${ext[m.mime] || 'bin'}` }));
      for (let i = 0; i < named.length; i++) {
        setExporting(`Gathering files… ${i + 1} of ${named.length}`);
        const r = await fetch(mediaUrl(named[i].id), { credentials: 'same-origin' });
        if (!r.ok) throw new Error('One of your files couldn’t be fetched. Nothing was downloaded.');
        files.push({ name: named[i].file, data: new Uint8Array(await r.arrayBuffer()) });
      }
      const doc = JSON.stringify({ ...data, media: named }, null, 2);
      files.unshift({ name: 'what-stayed.json', data: new TextEncoder().encode(doc) });
      const stamp = new Date().toISOString().slice(0, 10);
      save(zip(files), `what-stayed-${stamp}.zip`);
      store.toast('Your export is downloading.');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'The export didn’t work.', 'error');
    } finally {
      setExporting('');
    }
  }

  async function signOut() {
    setLeaving(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.assign('/welcome');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'Couldn’t sign out.', 'error');
      setLeaving(false);
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!password) return setErr('Enter your password to confirm.');
    setBusy(true);
    setErr('');
    try {
      await api('/api/account', { method: 'DELETE', json: { password } });
      window.location.assign('/welcome');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'That didn’t work.');
      setBusy(false);
    }
  }

  const photos = snap.media.filter((m) => m.kind === 'photo').length;
  const voices = snap.media.filter((m) => m.kind === 'voice').length;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  return (
    <main className="account">
      <Masthead room="account" />
      <section className="acc">
        <h1 className="arc-title">Your account</h1>
        <p className="arc-sub">{email}</p>

        <dl className="acc-count">
          <div><dt>Memories</dt><dd>{snap.memories.length}</dd></div>
          <div><dt>Pages</dt><dd>{snap.entries.length}</dd></div>
          <div><dt>Places</dt><dd>{Object.keys(snap.locations).length}</dd></div>
          <div><dt>Red threads</dt><dd>{snap.threads.length}</dd></div>
          <div><dt>Photographs</dt><dd>{photos}</dd></div>
          <div><dt>Recordings</dt><dd>{voices}</dd></div>
        </dl>

        <div className="acc-block">
          <h2>Take it with you</h2>
          <p>Download everything you’ve kept: memories, pages, places and threads as one readable file, with every photograph and recording alongside it.</p>
          <button type="button" className="quiet strong" onClick={exportAll} disabled={!!exporting}>
            {exporting || 'Download everything (.zip)'}
          </button>
        </div>

        <div className="acc-block">
          <h2>What’s true about your data</h2>
          <ul className="acc-facts">
            <li>Everything is stored in a database tied to your account, so it’s there on any device you sign in from.</li>
            <li>Only you can read it. Every request checks it is you before anything is shown or changed.</li>
            <li>Your password is never stored, only a salted scrypt hash of it.</li>
            <li>Photographs and recordings are stored in the same database and are only sent to you.</li>
            <li>Data is encrypted in transit (HTTPS). Encryption at rest and backups depend on the database provider’s plan; this app does not add its own.</li>
            <li>The garden’s conversation is sent to Anthropic to write the replies. Nothing else is shared.</li>
          </ul>
        </div>

        <div className="acc-block">
          <h2>Leave</h2>
          <p className="acc-row">
            <button type="button" className="quiet" onClick={signOut} disabled={leaving}>
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
          </p>
          {!confirming ? (
            <p className="acc-row">
              <button type="button" className="quiet danger" onClick={() => setConfirming(true)}>
                Delete my account and everything in it…
              </button>
            </p>
          ) : (
            <form className="acc-delete" onSubmit={remove} noValidate>
              <p>
                This deletes {n(snap.memories.length, 'memory', 'memories')}, {n(snap.entries.length, 'page', 'pages')} and{' '}
                {n(snap.media.length, 'file', 'files')}, for good. It can’t be undone. Consider downloading everything first.
              </p>
              <label className="tie-note">
                <span>Your password, to confirm</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <p className="welcome-error" role="alert">{err}</p>
              <div className="loc-acts">
                <button type="submit" className="quiet danger strong" disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete everything'}
                </button>
                <button type="button" className="quiet" onClick={() => { setConfirming(false); setPassword(''); setErr(''); }}>
                  Keep my account
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
