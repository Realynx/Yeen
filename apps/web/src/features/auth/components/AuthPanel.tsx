import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  confirmPasswordReset,
  login,
  requestPasswordReset,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { AuthResponse } from '../../shared/services/types';

interface AuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  initialResetToken?: string | null;
}

export function AuthPanel({
  onAuthenticated,
  secondaryActionLabel,
  onSecondaryAction,
  initialResetToken = null,
}: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'request-reset' | 'confirm-reset'>(
    initialResetToken ? 'confirm-reset' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);
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

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setResetPath(null);

    try {
      const response = await requestPasswordReset({ email });
      setNotice(response.message);
      setResetPath(response.resetPath);
    } catch (requestError) {
      setError(
        toApiErrorMessage(requestError, 'Unable to create a reset link.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      setBusy(false);
      return;
    }

    try {
      const response = await confirmPasswordReset({
        token: resetToken,
        newPassword,
      });
      setNotice(response.message);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMode('login');
      window.history.replaceState({}, '', '/');
    } catch (confirmError) {
      setError(
        toApiErrorMessage(confirmError, 'Unable to reset your password.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function openLoginMode() {
    setMode('login');
    setError(null);
    setNotice(null);
    setResetPath(null);
  }

  function openRequestResetMode() {
    setMode('request-reset');
    setError(null);
    setNotice(null);
    setResetPath(null);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Yeen Streaming</p>
        <h1>
          {mode === 'login'
            ? 'Welcome Back'
            : mode === 'request-reset'
              ? 'Reset Password'
              : 'Choose New Password'}
        </h1>
        <p className="subline">
          {mode === 'login'
            ? 'Sign in with your existing account. New accounts require an invite link from an existing user.'
            : mode === 'request-reset'
              ? 'Enter your account email and Yeen will generate a short-lived reset link.'
              : 'Enter the reset token from your link and choose a new password.'}
        </p>

        {mode === 'login' ? (
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

            {notice ? <p className="success-text">{notice}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" disabled={busy}>
              {busy ? 'Please wait...' : 'Log In'}
            </button>

            <button
              type="button"
              className="ghost-button"
              onClick={openRequestResetMode}
              disabled={busy}
            >
              Forgot password?
            </button>

            {secondaryActionLabel && onSecondaryAction ? (
              <button
                type="button"
                className="ghost-button"
                onClick={onSecondaryAction}
                disabled={busy}
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </form>
        ) : null}

        {mode === 'request-reset' ? (
          <form onSubmit={handleRequestReset} className="auth-form">
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

            {notice ? <p className="success-text">{notice}</p> : null}
            {resetPath ? (
              <a className="auth-reset-link" href={resetPath}>
                Open reset link
              </a>
            ) : null}
            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" disabled={busy}>
              {busy ? 'Generating...' : 'Generate Reset Link'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={openLoginMode}
              disabled={busy}
            >
              Back to sign in
            </button>
          </form>
        ) : null}

        {mode === 'confirm-reset' ? (
          <form onSubmit={handleConfirmReset} className="auth-form">
            <label>
              Reset Token
              <input
                required
                type="text"
                autoComplete="one-time-code"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                minLength={16}
                maxLength={256}
              />
            </label>
            <label>
              New Password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                placeholder="At least 8 characters"
              />
            </label>
            <label>
              Confirm New Password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                placeholder="Repeat your new password"
              />
            </label>

            {error ? <p className="error-text">{error}</p> : null}

            <button type="submit" disabled={busy}>
              {busy ? 'Resetting...' : 'Reset Password'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={openLoginMode}
              disabled={busy}
            >
              Back to sign in
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
