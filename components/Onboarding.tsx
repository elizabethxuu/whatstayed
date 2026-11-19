'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/store';
import { REMEMBER, REMEMBER_LABEL, STARTS, STARTS_LABEL, WAYS, WAYS_LABEL, type Profile } from '@/lib/profile';
import Tree from './Tree';

const KEY = 'whatstayed:onboarding';
const RETURNING = 'whatstayed:has-account';
const NONE: never[] = [];
const noop = () => {};

type Answers = Required<Pick<Profile, 'remember' | 'ways'>> & Omit<Profile, 'remember' | 'ways'>;
type View = 'flow' | 'signin' | 'forgot' | 'reset';

const STEPS = 9; // welcome … the beginning

function load(): { step: number; a: Answers } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.step === 'number') return v;
  } catch {
    /* storage unavailable */
  }
  return { step: 0, a: { remember: [], ways: [] } };
}

const vibrate = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

/** The first launch: one question at a time, every step skippable, ending at the garden. */
/**
 * The questions after an account is made (signed in): what to remember, a little about you, how you remember,
 * where to begin, what to preserve, reminders. Every step can be skipped; answers go to the profile.
 */
export default function Onboarding({ resetToken, signedIn = false }: { resetToken?: string; signedIn?: boolean }) {
  const [view, setView] = useState<View>(resetToken ? 'reset' : 'flow');
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ remember: [], ways: [] });
  const [dir, setDir] = useState<1 | -1>(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = load();
    let returning = false;
    try {
      returning = !!localStorage.getItem(RETURNING);
    } catch {
      /* storage unavailable */
    }
    if (!resetToken && !signedIn) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'signin' || (returning && saved.step === 0)) setView('signin');
    }
    setA(saved.a);
    if (signedIn) setStep(saved.step >= 1 && saved.step <= 6 ? saved.step : 1);
    else setStep(saved.step >= 8 ? 7 : saved.step); // never resume past account creation
    setReady(true);
  }, [resetToken, signedIn]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ step, a }));
    } catch {
      /* storage unavailable */
    }
  }, [step, a, ready]);

  const finish = async (answers: Answers) => {
    const { skipped, ...rest } = answers;
    await api('/api/profile', {
      method: 'PUT',
      json: {
        ...rest,
        name: rest.name?.trim() || undefined,
        home: rest.home?.trim() || undefined,
        intention: rest.intention?.trim() || undefined,
        showIntention: rest.showIntention ?? true,
        onboarded: !skipped,
        skipped: !!skipped,
      },
    }).catch(() => {});
  };
  const go = (n: number) => {
    vibrate();
    if (signedIn && n === 7) {
      finish(a);
      n = 8;
    }
    setDir(n > step ? 1 : -1);
    setStep(n);
  };
  const skip = () => {
    if (signedIn) {
      finish({ ...a, skipped: true }).then(() => {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* storage unavailable */
        }
        window.location.assign('/');
      });
      return;
    }
    setA((x) => ({ ...x, skipped: true }));
    go(7);
  };

  if (!ready) return <main className="ob" aria-busy="true" />;

  return (
    <main className="ob">
      <div className="ob-tree" aria-hidden="true">
        <Tree memories={NONE} threads={NONE} selected={null} onSelect={noop} />
      </div>
      {view === 'flow' && step < 7 && step > 0 && (
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS - 3} aria-valuenow={step} aria-label={`Step ${step} of ${STEPS - 3}`}>
          <i style={{ width: `${(step / (STEPS - 3)) * 100}%` }} />
        </div>
      )}
      <section className={`ob-screen ${dir > 0 ? 'fwd' : 'back'}`} key={`${view}-${step}`}>
        {view === 'signin' && <SignIn onForgot={() => setView('forgot')} onNew={() => { setView('flow'); setStep(0); }} />}
        {view === 'forgot' && <Forgot onBack={() => setView('signin')} />}
        {view === 'reset' && <ResetForm token={resetToken!} />}
        {view === 'flow' && (
          <Flow step={step} a={a} setA={setA} go={go} skip={skip} onSignIn={() => setView('signin')} />
        )}
      </section>
    </main>
  );
}

function Flow({
  step,
  a,
  setA,
  go,
  skip,
  onSignIn,
}: {
  step: number;
  a: Answers;
  setA: React.Dispatch<React.SetStateAction<Answers>>;
  go: (n: number) => void;
  skip: () => void;
  onSignIn: () => void;
}) {
  const toggle = (k: 'remember' | 'ways', v: string) =>
    setA((x) => {
      const cur = x[k] as string[];
      const next = cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v];
      return { ...x, [k]: next } as Answers;
    });
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch {
      return [];
    }
  }, []);
  useEffect(() => {
    if (step === 2 && !a.timezone) setA((x) => ({ ...x, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  }, [step, a.timezone, setA]);

  const nav = (next = step + 1, label = 'Continue', disabled = false) => (
    <div className="ob-nav">
      {step > 1 && (
        <button type="button" className="quiet" onClick={() => go(step - 1)}>
          Back
        </button>
      )}
      <button type="button" className="quiet ob-skip" onClick={skip}>
        Skip for now
      </button>
      <button type="button" className="welcome-go" onClick={() => go(next)} disabled={disabled}>
        {label}
      </button>
    </div>
  );

  switch (step) {
    case 0:
      return (
        <div className="ob-body ob-hello">
          <p className="mark">What Stayed</p>
          <h1 className="ob-title">What stayed with you?</h1>
          <p className="ob-sub">An archive of the places you’ve been, the people you’ve loved, and the moments that made you.</p>
          <div className="ob-actions">
            <button type="button" className="welcome-go" onClick={() => go(1)} autoFocus>
              Begin your story
            </button>
            <button type="button" className="quiet" onClick={onSignIn}>
              I already have an account
            </button>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="ob-body">
          <h1 className="ob-title">What would you like to remember?</h1>
          <p className="ob-sub">Choose as many as you like.</p>
          <div className="ob-choices" role="group" aria-label="What would you like to remember?">
            {REMEMBER.map((k) => (
              <button key={k} type="button" className="ob-choice" aria-pressed={a.remember.includes(k)} onClick={() => toggle('remember', k)}>
                {REMEMBER_LABEL[k]}
              </button>
            ))}
          </div>
          {nav()}
        </div>
      );
    case 2:
      return (
        <div className="ob-body">
          <h1 className="ob-title">A little about you</h1>
          <p className="ob-sub">All optional. It stays private to your account.</p>
          <div className="ob-fields">
            <label>
              <span>What should we call you?</span>
              <input value={a.name ?? ''} maxLength={60} autoComplete="given-name" onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Your first name" />
            </label>
            <label>
              <span>When is your birthday? (optional)</span>
              <input type="date" value={a.birthday ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setA({ ...a, birthday: e.target.value || undefined })} />
            </label>
            <label>
              <span>Where do you consider home?</span>
              <input value={a.home ?? ''} maxLength={120} onChange={(e) => setA({ ...a, home: e.target.value })} placeholder="A city, a house, a person" />
            </label>
            <label>
              <span>What time zone are you in?</span>
              <input list="ob-zones" value={a.timezone ?? ''} maxLength={60} onChange={(e) => setA({ ...a, timezone: e.target.value })} />
              <datalist id="ob-zones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              <em className="ob-hint">So “today” and evening reflections arrive at the right time. We guessed from your device.</em>
            </label>
          </div>
          {nav()}
        </div>
      );
    case 3:
      return (
        <div className="ob-body">
          <h1 className="ob-title">How do you usually remember things?</h1>
          <p className="ob-sub">The garden will start where you’re most at home.</p>
          <div className="ob-choices" role="group" aria-label="How do you usually remember things?">
            {WAYS.map((k) => (
              <button key={k} type="button" className="ob-choice" aria-pressed={a.ways.includes(k)} onClick={() => toggle('ways', k)}>
                {WAYS_LABEL[k]}
              </button>
            ))}
          </div>
          {nav()}
        </div>
      );
    case 4:
      return (
        <div className="ob-body">
          <h1 className="ob-title">Would you like to begin with memories from your past, or start from today?</h1>
          <div className="ob-choices one" role="radiogroup" aria-label="Where to begin">
            {STARTS.map((k) => (
              <button key={k} type="button" role="radio" className="ob-choice" aria-checked={a.start === k} onClick={() => setA({ ...a, start: k })}>
                {STARTS_LABEL[k]}
              </button>
            ))}
          </div>
          {nav()}
        </div>
      );
    case 5:
      return (
        <div className="ob-body">
          <h1 className="ob-title">What would you most like to preserve?</h1>
          <p className="ob-sub">In your own words. You can keep it in your archive, just for you.</p>
          <div className="ob-fields">
            <label>
              <span className="sr">What you’d most like to preserve</span>
              <textarea rows={4} maxLength={600} value={a.intention ?? ''} onChange={(e) => setA({ ...a, intention: e.target.value })} placeholder="I want to remember the little details of my twenties." />
            </label>
            <label className="ob-check">
              <input type="checkbox" checked={a.showIntention ?? true} onChange={(e) => setA({ ...a, showIntention: e.target.checked })} />
              Show this in my archive
            </label>
          </div>
          {nav()}
        </div>
      );
    case 6:
      return <Reminders a={a} setA={setA} go={go} skip={skip} />;
    case 7:
      return <CreateAccount a={a} onSignIn={onSignIn} onDone={() => go(8)} />;
    default:
      return (
        <div className="ob-body ob-hello ob-final">
          <h1 className="ob-title">Every life leaves something behind.</h1>
          <p className="ob-sub ob-sub-big">Let’s begin with what stayed.</p>
          <div className="ob-actions">
            <button
              type="button"
              className="welcome-go"
              autoFocus
              onClick={() => {
                try {
                  localStorage.removeItem(KEY);
                } catch {
                  /* storage unavailable */
                }
                window.location.assign('/');
              }}
            >
              Enter your garden
            </button>
          </div>
        </div>
      );
  }
}

function Reminders({ a, setA, go, skip }: { a: Answers; setA: React.Dispatch<React.SetStateAction<Answers>>; go: (n: number) => void; skip: () => void }) {
  const r = a.reminders ?? {};
  const [perm, setPerm] = useState<string>('');
  useEffect(() => setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission), []);
  const set = (k: 'evening' | 'weekly' | 'yearAgo', v: boolean) => setA({ ...a, reminders: { ...r, [k]: v } });
  const any = !!(r.evening || r.weekly || r.yearAgo);
  return (
    <div className="ob-body">
      <h1 className="ob-title">Would you like gentle reminders?</h1>
      <p className="ob-sub">Entirely optional. They wait quietly in Today when you open the app; nothing is ever sent to anyone else.</p>
      <div className="ob-toggles">
        {(
          [
            ['evening', 'A gentle evening reflection'],
            ['weekly', 'A weekly memory review'],
            ['yearAgo', 'Revisiting a memory from a year ago'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="ob-toggle">
            <span>{label}</span>
            <input type="checkbox" role="switch" checked={!!r[k]} onChange={(e) => set(k, e.target.checked)} />
            <i aria-hidden="true" />
          </label>
        ))}
      </div>
      {any && perm !== 'unsupported' && (
        <p className="ob-note">
          {perm === 'granted' ? (
            'Notifications are allowed on this device.'
          ) : perm === 'denied' ? (
            'Notifications are blocked for this site in your browser settings. Reminders will still wait for you in Today.'
          ) : (
            <>
              Want them on this device too?{' '}
              <button
                type="button"
                className="quiet strong"
                onClick={async () => {
                  // only now, because they asked
                  const p = await Notification.requestPermission();
                  setPerm(p);
                }}
              >
                Allow notifications
              </button>
            </>
          )}
        </p>
      )}
      <div className="ob-nav">
        <button type="button" className="quiet" onClick={() => go(5)}>
          Back
        </button>
        <button type="button" className="quiet ob-skip" onClick={skip}>
          Skip for now
        </button>
        <button type="button" className="welcome-go" onClick={() => go(7)}>
          Continue
        </button>
      </div>
    </div>
  );
}

function rememberAccount() {
  try {
    localStorage.setItem(RETURNING, '1');
  } catch {
    /* storage unavailable */
  }
}

function CreateAccount({ a, onSignIn, onDone }: { a: Answers; onSignIn: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter your email.');
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/signup', { method: 'POST', json: { email: email.trim(), password } });
      rememberAccount();
      const { skipped, ...rest } = a;
      await api('/api/profile', {
        method: 'PUT',
        json: {
          ...rest,
          name: rest.name?.trim() || undefined,
          home: rest.home?.trim() || undefined,
          intention: rest.intention?.trim() || undefined,
          showIntention: rest.showIntention ?? true,
          onboarded: !skipped,
          skipped: !!skipped,
        },
      }).catch(() => {});
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      setBusy(false);
    }
  }
  return (
    <div className="ob-body">
      <h1 className="ob-title">Keep it safe</h1>
      <p className="ob-sub">Create an account so your garden is there whenever you return, on any device. Only you can see what you keep.</p>
      <form className="welcome-form" onSubmit={submit} noValidate>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required aria-describedby="pw-hint" />
        </label>
        <p id="pw-hint" className="welcome-hint">
          At least 8 characters.
        </p>
        <p className="welcome-error" role="alert" aria-live="assertive">
          {error}
        </p>
        <button type="submit" className="welcome-go" disabled={busy}>
          {busy ? 'Creating…' : 'Create my garden'}
        </button>
      </form>
      <p className="welcome-switch">
        Already have a garden?{' '}
        <button type="button" className="quiet" onClick={onSignIn}>
          Sign in
        </button>
      </p>
    </div>
  );
}

function SignIn({ onForgot, onNew }: { onForgot: () => void; onNew: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter your email.');
    if (!password) return setError('Please enter your password.');
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', json: { email: email.trim(), password } });
      rememberAccount();
      window.location.assign('/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      setBusy(false);
    }
  }
  return (
    <div className="ob-body">
      <p className="mark">What Stayed</p>
      <h1 className="ob-title">Welcome back.</h1>
      <p className="ob-sub">Sign in to your garden.</p>
      <form className="welcome-form" onSubmit={submit} noValidate>
        <label>
          <span>Email</span>
          <input ref={first} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <p className="welcome-error" role="alert" aria-live="assertive">
          {error}
        </p>
        <button type="submit" className="welcome-go" disabled={busy}>
          {busy ? 'Opening…' : 'Sign in'}
        </button>
      </form>
      <p className="welcome-switch">
        <button type="button" className="quiet" onClick={onForgot}>
          Forgot your password?
        </button>
      </p>
      <p className="welcome-switch">
        New here?{' '}
        <button type="button" className="quiet" onClick={onNew}>
          Begin your story
        </button>
      </p>
    </div>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter your email.');
    setBusy(true);
    setError('');
    try {
      const r = await api<{ message: string; testLink?: string | null }>('/api/auth/reset/request', { method: 'POST', json: { email: email.trim() } });
      setMsg(r.message);
      if (r.testLink) setLink(r.testLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
    }
    setBusy(false);
  }
  return (
    <div className="ob-body">
      <h1 className="ob-title">Reset your password</h1>
      <p className="ob-sub">Enter the email you signed up with, and we’ll send a link to choose a new password.</p>
      {msg ? (
        <>
          <p className="ob-note" role="status">
            {msg}
          </p>
          {link && (
            <p className="ob-note">
              Test mode (no email is sent): <a href={link}>open the reset link</a>
            </p>
          )}
        </>
      ) : (
        <form className="welcome-form" onSubmit={submit} noValidate>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <p className="welcome-error" role="alert">
            {error}
          </p>
          <button type="submit" className="welcome-go" disabled={busy}>
            {busy ? 'Sending…' : 'Send the link'}
          </button>
        </form>
      )}
      <p className="welcome-switch">
        <button type="button" className="quiet" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </div>
  );
}

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/reset/confirm', { method: 'POST', json: { token, password } });
      rememberAccount();
      window.location.assign('/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      setBusy(false);
    }
  }
  return (
    <div className="ob-body">
      <h1 className="ob-title">Choose a new password</h1>
      <p className="ob-sub">You’ll be signed in, and signed out everywhere else.</p>
      <form className="welcome-form" onSubmit={submit} noValidate>
        <label>
          <span>New password</span>
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </label>
        <p className="welcome-error" role="alert">
          {error}
        </p>
        <button type="submit" className="welcome-go" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </div>
  );
}
