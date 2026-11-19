'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './Masthead';
import { api, mediaUrl, useStore, type Media } from '@/lib/store';
import { zip } from '@/lib/zip';
import { preparePhoto } from '@/lib/media';
import { confirmSheet } from '@/lib/confirm';
import { REMEMBER, REMEMBER_LABEL, STARTS, STARTS_LABEL, WAYS, WAYS_LABEL, type Profile } from '@/lib/profile';
import { applyAppearance } from './Appearance';

const ext: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
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

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** You: who you are here, what you've kept, how the app behaves, and your account. */
export default function You({ email }: { email: string }) {
  const [snap] = useStore();
  const p = snap.profile;

  return (
    <main className="you-room">
      <Masthead room="you" />
      <section className="you-page">
        <Header email={email} />
        <ArchiveCounts />
        <ProfileForm key={JSON.stringify(p).length} />
        <Preferences />
        <Privacy />
        <AgentSection />
        <Data />
        <Account email={email} />
      </section>
    </main>
  );
}

function Header({ email }: { email: string }) {
  const [snap, store] = useStore();
  const p = snap.profile;
  const photo = p.photoId && snap.media.find((m) => m.id === p.photoId);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const blob = await preparePhoto(f, 800);
      const m = await store.addMedia({ type: 'profile', id: 'me' }, 'photo', blob);
      if (m) {
        if (p.photoId) await api(`/api/media/${p.photoId}`, { method: 'DELETE' }).catch(() => {});
        await store.saveProfile({ photoId: m.id }, true);
      }
    } catch (err) {
      store.toast(err instanceof Error ? err.message : 'That photograph couldn’t be used.', 'error');
    }
    setBusy(false);
  }
  return (
    <header className="you-head">
      <button type="button" className="you-photo" onClick={() => file.current?.click()} disabled={busy} aria-label={photo ? 'Change your photograph' : 'Add a photograph of you'}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(photo.id)} alt="" />
        ) : (
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="15" r="6.5" />
            <path d="M7 35c2-7.4 7.4-11.4 13-11.4S31 27.6 33 35" />
          </svg>
        )}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={onPhoto} />
      <div>
        <h1 className="arc-title you-name">{p.name || 'You'}</h1>
        <p className="arc-sub">{email}</p>
        {p.intention && p.showIntention !== false && <p className="you-intention">{p.intention}</p>}
      </div>
    </header>
  );
}

function ArchiveCounts() {
  const [snap] = useStore();
  const places = new Set(Object.values(snap.locations).map((l) => (l.city || l.name || '').toLowerCase()).filter(Boolean)).size;
  const rows: [string, number, string][] = [
    ['Memories', snap.memories.length, '/'],
    ['Journal entries', snap.entries.length, '/archives'],
    ['Places saved', places, '/places'],
    ['People remembered', snap.people.length, '/people'],
    ['Collections', snap.collections.length, '/collections'],
    ['Photographs', snap.media.filter((m) => m.kind === 'photo' && m.ownerType !== 'profile').length, '/search'],
    ['Voice notes', snap.media.filter((m) => m.kind === 'voice').length, '/search'],
    ['Red threads', snap.threads.length, '/'],
    ['Letters', snap.letters.length, '/letters'],
  ];
  return (
    <section className="you-block" aria-labelledby="yaT">
      <h2 id="yaT">Your archive</h2>
      <ul className="you-counts">
        {rows.map(([label, v, href]) => (
          <li key={label}>
            <Link href={href}>
              <span className="you-count">{v}</span>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="you-explore">
        <Link className="quiet" href="/timeline">Timeline</Link>
        <Link className="quiet" href="/letters">Letters to your future self</Link>
        <Link className="quiet" href="/search">Search everything</Link>
      </p>
    </section>
  );
}

function ProfileForm() {
  const [snap, store] = useStore();
  const p = snap.profile;
  const [f, setF] = useState<Profile>({
    name: p.name ?? '',
    birthday: p.birthday ?? '',
    home: p.home ?? '',
    timezone: p.timezone ?? '',
    intention: p.intention ?? '',
    showIntention: p.showIntention ?? true,
    remember: p.remember ?? [],
    ways: p.ways ?? [],
    start: p.start,
  });
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  }, []);
  const toggle = (k: 'remember' | 'ways', v: string) =>
    setF((x) => {
      const cur = (x[k] ?? []) as string[];
      return { ...x, [k]: cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v] } as Profile;
    });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await store.saveProfile({ ...f, birthday: f.birthday || undefined, onboarded: true });
    setBusy(false);
  }
  return (
    <form className="you-block" onSubmit={submit} aria-labelledby="ypT">
      <h2 id="ypT">Your profile</h2>
      <div className="you-grid">
        <label className="rv-field">
          <span>Name</span>
          <input value={f.name} maxLength={60} autoComplete="given-name" onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="rv-field">
          <span>Birthday (optional)</span>
          <input type="date" value={f.birthday ?? ''} onChange={(e) => setF({ ...f, birthday: e.target.value })} />
        </label>
        <label className="rv-field">
          <span>Home</span>
          <input value={f.home} maxLength={120} onChange={(e) => setF({ ...f, home: e.target.value })} />
        </label>
        <label className="rv-field">
          <span>Time zone</span>
          <input list="you-zones" value={f.timezone} maxLength={60} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
          <datalist id="you-zones">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="rv-field">
        <span>What you’d most like to preserve</span>
        <textarea rows={3} maxLength={600} value={f.intention} onChange={(e) => setF({ ...f, intention: e.target.value })} />
      </label>
      <label className="rv-check">
        <input type="checkbox" checked={!!f.showIntention} onChange={(e) => setF({ ...f, showIntention: e.target.checked })} />
        Show it in my archive
      </label>
      <fieldset className="you-chips">
        <legend>What you’d like to remember</legend>
        {REMEMBER.map((k) => (
          <button key={k} type="button" className="ob-choice small" aria-pressed={f.remember?.includes(k)} onClick={() => toggle('remember', k)}>
            {REMEMBER_LABEL[k]}
          </button>
        ))}
      </fieldset>
      <fieldset className="you-chips">
        <legend>How you usually remember</legend>
        {WAYS.map((k) => (
          <button key={k} type="button" className="ob-choice small" aria-pressed={f.ways?.includes(k)} onClick={() => toggle('ways', k)}>
            {WAYS_LABEL[k]}
          </button>
        ))}
      </fieldset>
      <fieldset className="you-chips">
        <legend>Where you’re beginning</legend>
        {STARTS.map((k) => (
          <button key={k} type="button" className="ob-choice small" aria-pressed={f.start === k} onClick={() => setF({ ...f, start: k })}>
            {STARTS_LABEL[k]}
          </button>
        ))}
      </fieldset>
      <p className="you-save">
        <button type="submit" className="welcome-go" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </p>
    </form>
  );
}

function Preferences() {
  const [snap, store] = useStore();
  const p = snap.profile;
  const r = p.reminders ?? {};
  const [perm, setPerm] = useState('');
  useEffect(() => setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission), []);
  const setReminder = (k: 'evening' | 'weekly' | 'yearAgo', v: boolean) => store.saveProfile({ reminders: { [k]: v } }, true);
  const any = !!(r.evening || r.weekly || r.yearAgo);
  return (
    <section className="you-block" aria-labelledby="yfT">
      <h2 id="yfT">Preferences</h2>
      <div className="you-row">
        <span>Appearance</span>
        <span className="seg" role="radiogroup" aria-label="Appearance">
          {(['light', 'system', 'dark'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={(p.appearance ?? 'light') === v}
              onClick={() => {
                applyAppearance(v);
                store.saveProfile({ appearance: v }, true);
              }}
            >
              {v === 'system' ? 'Follow the day' : v === 'light' ? 'Dawn' : 'Night'}
            </button>
          ))}
        </span>
      </div>
      <label className="ob-toggle">
        <span>
          Daily reflection
          <em>One question a day on Today, saved to your Archives if you answer.</em>
        </span>
        <input type="checkbox" role="switch" checked={p.reflection?.enabled !== false} onChange={(e) => store.saveProfile({ reflection: { enabled: e.target.checked } }, true)} />
        <i aria-hidden="true" />
      </label>
      <h3>Reminders</h3>
      {(
        [
          ['evening', 'A gentle evening reflection', 'Waits on Today after 6 in the evening.'],
          ['weekly', 'A weekly memory review', 'On Sundays, the week’s memories, together.'],
          ['yearAgo', 'Revisiting a memory from a year ago', 'When something happened on this day in an earlier year.'],
        ] as const
      ).map(([k, label, hint]) => (
        <label key={k} className="ob-toggle">
          <span>
            {label}
            <em>{hint}</em>
          </span>
          <input type="checkbox" role="switch" checked={!!r[k]} onChange={(e) => setReminder(k, e.target.checked)} />
          <i aria-hidden="true" />
        </label>
      ))}
      <p className="you-note">
        Reminders appear in Today when you open What Stayed.{' '}
        {perm === 'unsupported'
          ? 'This browser can’t show notifications.'
          : perm === 'granted'
            ? 'Notifications are allowed on this device.'
            : perm === 'denied'
              ? 'Notifications are blocked for this site in your browser settings.'
              : any && (
                  <button
                    type="button"
                    className="quiet strong"
                    onClick={async () => setPerm(await Notification.requestPermission())}
                  >
                    Allow notifications on this device
                  </button>
                )}{' '}
        Notifications while the app is closed need a push service, which isn’t set up yet.
      </p>
    </section>
  );
}

function Privacy() {
  const [snap, store] = useStore();
  const p = snap.profile;
  const [geo, setGeo] = useState('');
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((s) => setGeo(s.state))
      .catch(() => setGeo('unknown'));
  }, []);
  return (
    <section className="you-block" aria-labelledby="yvT">
      <h2 id="yvT">Privacy</h2>
      <ul className="acc-facts">
        <li>Everything you keep is private to your account. Nothing is shared or public.</li>
        <li>Photographs, the microphone and your location are only used when you choose them, and your browser asks you first.</li>
      </ul>
      <div className="you-row">
        <span>
          Location
          <em>
            {geo === 'granted'
              ? 'Your browser allows this site to use your location when you ask.'
              : geo === 'denied'
                ? 'Your browser blocks location for this site. You can still type places.'
                : 'Asked only when you tap “Use where I am now”.'}
          </em>
        </span>
        <span className="seg" role="radiogroup" aria-label="Offer to use my location">
          {(['ask', 'never'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={(p.locationAsk ?? 'ask') === v} onClick={() => store.saveProfile({ locationAsk: v }, true)}>
              {v === 'ask' ? 'Offer it' : 'Never offer'}
            </button>
          ))}
        </span>
      </div>
      <p className="acc-row">
        <button
          type="button"
          className="quiet danger"
          onClick={async () => {
            if (
              await confirmSheet({
                title: 'Delete your personal details?',
                body: 'Your name, birthday, home, time zone, intention, photograph and preferences are deleted. Your memories, pages, places and people are not touched.',
                yes: 'Delete my details',
                danger: true,
              })
            )
              store.clearProfile();
          }}
        >
          Delete my personal information…
        </button>
      </p>
    </section>
  );
}

function Data() {
  const [, store] = useStore();
  const [exporting, setExporting] = useState('');
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
      files.unshift({ name: 'what-stayed.json', data: new TextEncoder().encode(JSON.stringify({ ...data, media: named }, null, 2)) });
      save(zip(files), `what-stayed-${new Date().toISOString().slice(0, 10)}.zip`);
      store.toast('Your export is downloading.');
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'The export didn’t work.', 'error');
    } finally {
      setExporting('');
    }
  }
  return (
    <section className="you-block" aria-labelledby="ydT">
      <h2 id="ydT">Your data</h2>
      <p className="you-note">Download everything you’ve kept: memories, pages, places, people, collections, letters, conversations and your profile as one readable file, with every photograph and recording alongside it.</p>
      <button type="button" className="quiet strong" onClick={exportAll} disabled={!!exporting}>
        {exporting || 'Download everything (.zip)'}
      </button>
    </section>
  );
}

function Account({ email }: { email: string }) {
  const [snap, store] = useStore();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function changePw(e: FormEvent) {
    e.preventDefault();
    if (!cur) return setPwErr('Enter your current password.');
    if (next.length < 8) return setPwErr('Choose a new password of at least 8 characters.');
    setPwBusy(true);
    setPwErr('');
    const ok = await store.changePassword(cur, next);
    setPwBusy(false);
    if (ok) {
      setCur('');
      setNext('');
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
    setErr('');
    try {
      await api('/api/account', { method: 'DELETE', json: { password } });
      window.location.assign('/welcome');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'That didn’t work.');
    }
  }
  return (
    <section className="you-block" aria-labelledby="yxT">
      <h2 id="yxT">Account</h2>
      <p className="you-row">
        <span>Email</span>
        <span>{email}</span>
      </p>
      <form className="you-pw" onSubmit={changePw} noValidate>
        <h3>Change password</h3>
        <div className="you-grid">
          <label className="rv-field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </label>
          <label className="rv-field">
            <span>New password</span>
            <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
        </div>
        <p className="welcome-error" role="alert">
          {pwErr}
        </p>
        <button type="submit" className="quiet strong" disabled={pwBusy}>
          {pwBusy ? 'Changing…' : 'Change password'}
        </button>
      </form>
      <p className="acc-row">
        <button type="button" className="quiet" onClick={signOut} disabled={leaving}>
          {leaving ? 'Signing out…' : 'Sign out'}
        </button>
      </p>
      {!deleting ? (
        <p className="acc-row">
          <button type="button" className="quiet danger" onClick={() => setDeleting(true)}>
            Delete my account and everything in it…
          </button>
        </p>
      ) : (
        <form className="acc-delete" onSubmit={remove} noValidate>
          <p>
            This deletes {n(snap.memories.length, 'memory', 'memories')}, {n(snap.entries.length, 'page', 'pages')}, {n(snap.people.length, 'person', 'people')} and{' '}
            {n(snap.media.length, 'file', 'files')}, for good. It can’t be undone. Consider downloading everything first.
          </p>
          <label className="tie-note">
            <span>Your password, to confirm</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="welcome-error" role="alert">
            {err}
          </p>
          <div className="loc-acts">
            <button type="submit" className="quiet danger strong">
              Delete everything
            </button>
            <button type="button" className="quiet" onClick={() => { setDeleting(false); setPassword(''); setErr(''); }}>
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** The agent: what it may suggest, and a plain record of what it has done. */
function AgentSection() {
  const [snap, store] = useStore();
  const on = snap.profile.proactive !== false;
  const [log, setLog] = useState<{ tool: string; ok: boolean; ms: number; error?: string; at: number }[] | null>(null);
  async function showLog() {
    try {
      setLog((await api<{ log: { tool: string; ok: boolean; ms: number; error?: string; at: number }[] }>('/api/agent/log')).log);
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'That couldn’t be loaded.', 'error');
    }
  }
  const name = (t: string) => t.replace(/([A-Z])/g, ' $1').toLowerCase();
  return (
    <section className="you-block" aria-labelledby="ygT">
      <h2 id="ygT">The agent</h2>
      <label className="ob-toggle">
        <span>
          Suggestions for revisiting your memories
          <em>Places and people that recur, drafts left unfinished, memories that could be tied. Shown on Today, never sent anywhere.</em>
        </span>
        <input type="checkbox" role="switch" checked={on} onChange={(e) => store.saveProfile({ proactive: e.target.checked }, true)} />
        <i aria-hidden="true" />
      </label>
      <ul className="acc-facts">
        <li>It reads only your own archive, and only what a question needs.</li>
        <li>It drafts memories for you to review, and asks before it ties, changes or deletes anything.</li>
        <li>Reflections it writes are kept only if you choose, and are marked as written by the agent.</li>
      </ul>
      {log === null ? (
        <p className="you-note">
          <button type="button" className="quiet strong" onClick={showLog}>
            What the agent has done
          </button>
        </p>
      ) : log.length === 0 ? (
        <p className="you-note">Nothing yet.</p>
      ) : (
        <ol className="agent-log">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? '' : 'failed'}>
              <span>{name(l.tool)}</span>
              <span>{l.ok ? 'done' : `didn’t work${l.error ? `: ${l.error}` : ''}`}</span>
              <time>{new Date(l.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
