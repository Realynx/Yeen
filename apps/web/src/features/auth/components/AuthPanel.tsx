import { useState, type FormEvent } from 'react';
import {
  getConfiguredApiBaseUrl,
  getRuntimeApiBaseUrl,
  login,
  setRuntimeApiBaseUrl,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { AuthResponse } from '../../shared/services/types';

interface AuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  initialResetToken?: string | null;
  showServerConfiguration?: boolean;
}

type AuthMode = 'login' | 'request-reset';
const AUTH_COPY: Record<AuthMode, { title: string; subline: string }> = {
  login: { title: 'Welcome Back', subline: 'Sign in with your existing account. New accounts require an invite link from an existing user.' },
  'request-reset': { title: 'Password recovery', subline: 'Contact your Yeen administrator. They can reset your password from Accounts in Settings.' },
};

function AuthMessages({ notice, error }: { notice?: string | null; error: string | null }) {
  return <>{notice ? <p className="success-text">{notice}</p> : null}
    {error ? <p className="error-text">{error}</p> : null}</>;
}

function ServerConfiguration({ show, apiBaseInput, activeApiBase, notice, onInput, onSave, onDefault }: {
  show: boolean; apiBaseInput: string; activeApiBase: string; notice: string | null;
  onInput: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDefault: () => void;
}) {
  if (!show) return null;
  return <form className="auth-form native-server-form" onSubmit={onSave} aria-label="Yeen server connection">
    <label>Yeen Server<input required type="url" inputMode="url" autoCapitalize="none" autoCorrect="off"
      spellCheck={false} value={apiBaseInput} onChange={(event) => onInput(event.target.value)}
      placeholder="https://media.example.com/api" /></label>
    <p className="native-server-active">Connected to: {activeApiBase}</p>
    {notice ? <p className="auth-server-notice" role="status">{notice}</p> : null}
    <div className="native-server-actions"><button type="submit" className="ghost-button">Save Server</button>
      <button type="button" className="ghost-button" onClick={onDefault}>Use Default</button></div>
  </form>;
}

export function AuthPanel({
  onAuthenticated,
  secondaryActionLabel,
  onSecondaryAction,
  initialResetToken = null,
  showServerConfiguration = false,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(
    initialResetToken ? 'request-reset' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState(() =>
    getRuntimeApiBaseUrl() ?? getConfiguredApiBaseUrl(),
  );
  const [activeApiBase, setActiveApiBase] = useState(() =>
    getConfiguredApiBaseUrl(),
  );
  const [serverNotice, setServerNotice] = useState<string | null>(null);

  function handleSaveServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = setRuntimeApiBaseUrl(apiBaseInput);
    if (!normalized) {
      setServerNotice('Enter a valid server URL, including /api.');
      return;
    }

    setApiBaseInput(normalized);
    setActiveApiBase(normalized);
    setServerNotice('Server saved. You can sign in now.');
    setError(null);
  }

  function handleUseDefaultServer() {
    setRuntimeApiBaseUrl(null);
    const defaultApiBase = getConfiguredApiBaseUrl();
    setApiBaseInput(defaultApiBase);
    setActiveApiBase(defaultApiBase);
    setServerNotice('Default server restored.');
    setError(null);
  }

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

  function openLoginMode() {
    setMode('login');
    setError(null);
  }

  function openRequestResetMode() {
    setMode('request-reset');
    setError(null);
  }

  return (
    <main className="auth-page">
      <section className={`auth-panel${showServerConfiguration ? ' native-auth-panel' : ''}`}>
        <p className="eyebrow">Yeen Streaming</p>
        <h1>{AUTH_COPY[mode].title}</h1>
        <p className="subline">{AUTH_COPY[mode].subline}</p>

        <div className="auth-panel-content">
          <ServerConfiguration show={showServerConfiguration} apiBaseInput={apiBaseInput}
            activeApiBase={activeApiBase} notice={serverNotice} onInput={setApiBaseInput}
            onSave={handleSaveServer} onDefault={handleUseDefaultServer} />

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

            <AuthMessages error={error} />

            <button
              type="submit"
              data-tv-initial-focus={showServerConfiguration ? true : undefined}
              data-tv-focus-key={showServerConfiguration ? 'password-login-submit' : undefined}
              disabled={busy}
            >
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
            <button type="button" className="ghost-button" onClick={openLoginMode}>
              Back to sign in
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
