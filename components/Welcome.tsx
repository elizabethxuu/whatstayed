'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/store';
import Tree from './Tree';

const NONE: never[] = [];
const noop = () => {};

type Mode = 'in' | 'up' | 'forgot' | 'reset';

/** Sign in, or begin a garden. Quiet, two fields, no clutter. Forgotten passwords are reset here too. */
export default function Welcome({ resetToken }: { resetToken?: string }) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ message: string; testLink?: string | null } | null>(null);

  // /welcome?mode=up opens on "Create an account"
  useEffect(() => {
    if (!resetToken && new URLSearchParams(window.location.search).get('mode') === 'up') setMode('up');
  }, [resetToken]);

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setSent(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (mode === 'reset') {
      if (password.length < 8) return setError('Choose a password of at least 8 characters.');
      setBusy(true);
      try {
        await api('/api/auth/reset/confirm', { method: 'POST', json: { token: resetToken, password } });
        window.location.assign('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
        setBusy(false);
      }
      return;
    }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter your email.');
    if (mode === 'forgot') {
      setBusy(true);
      try {
        setSent(await api<{ message: string; testLink?: string | null }>('/api/auth/reset/request', { method: 'POST', json: { email: email.trim() } }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      }
      setBusy(false);
      return;
    }
    if (password.length < (mode === 'up' ? 8 : 1)) return setError(mode === 'up' ? 'Choose a password of at least 8 characters.' : 'Please enter your password.');
    setBusy(true);
    try {
      await api(`/api/auth/${mode === 'up' ? 'signup' : 'login'}`, { method: 'POST', json: { email: email.trim(), password } });
      try {
        localStorage.setItem('whatstayed:has-account', '1');
      } catch {
        /* storage unavailable */
      }
      // a new garden begins with a few questions (all skippable); a returning one opens on the tree
      window.location.assign(mode === 'up' ? '/begin' : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      setBusy(false);
    }
  }

  const title = { in: 'Welcome back.', up: 'Create an account.', forgot: 'Reset your password.', reset: 'Choose a new password.' }[mode];
  const sub = {
    in: 'Sign in to your garden.',
    up: 'A private archive of places, people and memories.',
    forgot: 'Enter the email you signed up with, and we’ll send a link to choose a new password.',
    reset: 'You’ll be signed in, and signed out everywhere else.',
  }[mode];

  return (
    <main className="welcome">
      <div className="welcome-tree" aria-hidden="true">
        <Tree memories={NONE} threads={NONE} selected={null} onSelect={noop} />
      </div>
      <div className="welcome-card">
        <p className="mark">What Stayed</p>
        <h1 className="welcome-title">{title}</h1>
        <p className="welcome-sub">{sub}</p>

        {sent ? (
          <div className="welcome-form">
            <p className="welcome-note" role="status">
              {sent.message}
            </p>
            {sent.testLink && (
              <p className="welcome-note">
                Test mode (no email is sent): <a href={sent.testLink}>open the reset link</a>
              </p>
            )}
          </div>
        ) : (
          <form className="welcome-form" onSubmit={submit} noValidate>
            {mode !== 'reset' && (
              <label>
                <span>Email</span>
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={error && !email ? true : undefined} />
              </label>
            )}
            {mode !== 'forgot' && (
              <label>
                <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
                <input
                  type="password"
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  value={password}
                  minLength={mode === 'in' ? undefined : 8}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus={mode === 'reset'}
                  aria-describedby={mode !== 'in' ? 'pw-hint' : undefined}
                />
              </label>
            )}
            {(mode === 'up' || mode === 'reset') && (
              <p id="pw-hint" className="welcome-hint">
                At least 8 characters.
              </p>
            )}
            <p className="welcome-error" role="alert" aria-live="assertive">
              {error}
            </p>
            <button type="submit" className="welcome-go" disabled={busy}>
              {busy
                ? { in: 'Opening…', up: 'Creating…', forgot: 'Sending…', reset: 'Saving…' }[mode]
                : { in: 'Sign in', up: 'Begin', forgot: 'Send the link', reset: 'Save and sign in' }[mode]}
            </button>
          </form>
        )}

        {mode === 'in' && (
          <p className="welcome-switch">
            <button type="button" className="quiet" onClick={() => go('forgot')}>
              Forgot your password?
            </button>
          </p>
        )}
        {mode !== 'reset' && (
          <p className="welcome-switch">
            {mode === 'in' ? 'New here?' : mode === 'up' ? 'Already have a garden?' : ''}{' '}
            <button type="button" className="quiet" onClick={() => go(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? 'Begin a garden' : mode === 'up' ? 'Sign in' : 'Back to sign in'}
            </button>
          </p>
        )}
      </div>
    </main>
  );
}
