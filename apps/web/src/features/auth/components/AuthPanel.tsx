import { useState } from 'react';
import type { FormEvent } from 'react';
import { login, toApiErrorMessage } from '../../shared/services/api';
import type { AuthResponse } from '../../shared/services/types';

interface AuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
}

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await login({ email, password });

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
        <h1>Welcome Back</h1>
        <p className="subline">
          Sign in with your existing account. New accounts require an invite link
          from an existing user.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              placeholder="At least 8 characters"
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait...' : 'Log In'}
          </button>
        </form>
      </section>
    </main>
  );
}
