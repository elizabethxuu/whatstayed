'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/store';
import Tree from './Tree';

const NONE: never[] = [];
const noop = () => {};

/** Sign in, or begin a garden. Quiet, two fields, no clutter. */
export default function Welcome() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter your email.');
    if (password.length < (mode === 'up' ? 8 : 1)) return setError(mode === 'up' ? 'Choose a password of at least 8 characters.' : 'Please enter your password.');
    setBusy(true);
    setError('');
    try {
      await api(`/api/auth/${mode === 'up' ? 'signup' : 'login'}`, { method: 'POST', json: { email: email.trim(), password } });
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="welcome">
      <div className="welcome-tree" aria-hidden="true">
        <Tree memories={NONE} threads={NONE} selected={null} onSelect={noop} />
      </div>
      <div className="welcome-card">
        <p className="mark">What Stayed</p>
        <h1 className="welcome-title">{mode === 'in' ? 'Welcome back.' : 'Begin a garden.'}</h1>
        <p className="welcome-sub">
          {mode === 'in'
            ? 'Your memories, pages and places are waiting where you left them.'
            : 'A quiet place for the moments that stayed with you. Only you can see what you keep here.'}
        </p>

        <form className="welcome-form" onSubmit={submit} noValidate>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-invalid={error && !email ? true : undefined}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              value={password}
              minLength={mode === 'up' ? 8 : undefined}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-describedby={mode === 'up' ? 'pw-hint' : undefined}
            />
          </label>
          {mode === 'up' && (
            <p id="pw-hint" className="welcome-hint">
              At least 8 characters.
            </p>
          )}
          <p className="welcome-error" role="alert" aria-live="assertive">
            {error}
          </p>
          <button type="submit" className="welcome-go" disabled={busy}>
            {busy ? (mode === 'in' ? 'Opening…' : 'Planting…') : mode === 'in' ? 'Sign in' : 'Begin'}
          </button>
        </form>

        <p className="welcome-switch">
          {mode === 'in' ? 'New here?' : 'Already have a garden?'}{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError('');
            }}
          >
            {mode === 'in' ? 'Begin a garden' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}
