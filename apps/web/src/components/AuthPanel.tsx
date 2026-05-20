import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { login, register, toApiErrorMessage } from '../lib/api';
import type { AuthResponse } from '../lib/types';

interface AuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
}

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => {
    return mode === 'login' ? 'Welcome Back' : 'Create Your Account';
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response =
        mode === 'login'
          ? await login({ email, password })
          : await register({ email, password, name });

      onAuthenticated(response);
    } catch (submissionError) {
      setError(
        toApiErrorMessage(submissionError, 'Something went wrong. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Yeen Streaming</p>
        <h1>{title}</h1>
        <p className="subline">
          Focused media server with local playback, smart subtitles, and smooth
          transcoding fallback.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' ? (
            <label>
              Display Name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={64}
                placeholder="Captain Movie Night"
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@domain.com"
            />
          </label>

          <label>
            Password
            <input
              required
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              placeholder="At least 8 characters"
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" disabled={busy}>
            {busy
              ? 'Please wait...'
              : mode === 'login'
                ? 'Log In'
                : 'Create Account'}
          </button>
        </form>

        <div className="switch-row">
          {mode === 'login' ? 'Need an account?' : 'Already have one?'}
          <button
            type="button"
            className="ghost-button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </div>
      </section>
    </main>
  );
}
