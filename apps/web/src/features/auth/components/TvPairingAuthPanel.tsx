import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
} from 'react';
import {
  getConfiguredApiBaseUrl,
  getRuntimeApiBaseUrl,
  pollTvPairingStatus,
  requestTvPairingCode,
  setRuntimeApiBaseUrl,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  AuthResponse,
  TvPairingStartResponse,
} from '../../shared/services/types';
import {
  formatCode,
  formatCountdown,
  getOrCreateTvPairingClientId,
  normalizeOptionalText,
  secondsUntil,
  TV_PAIRING_DEVICE_NAME_MAX_LENGTH,
  TV_PAIRING_DEVICE_PLATFORM_MAX_LENGTH,
} from './tvPairingAuthPanel.helpers';
import { TvPageShell } from '../../navigation/components/TvPageShell';
import './TvPairingAuthPanel.css';

interface TvPairingAuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
  onUsePasswordLogin: () => void;
}

export function TvPairingAuthPanel({
  onAuthenticated,
  onUsePasswordLogin,
}: TvPairingAuthPanelProps) {
  const hasStartedInitialPairing = useRef(false);
  const [apiBaseInput, setApiBaseInput] = useState<string>(() => {
    return getRuntimeApiBaseUrl() ?? getConfiguredApiBaseUrl();
  });
  const [activeApiBase, setActiveApiBase] = useState<string>(() => {
    return getConfiguredApiBaseUrl();
  });
  const [pairing, setPairing] = useState<TvPairingStartResponse | null>(null);
  const [loadingPairing, setLoadingPairing] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const displayedSecondsRemaining = pairing ? secondsRemaining : 0;

  const startPairing = useCallback(async () => {
    setLoadingPairing(true);
    setError(null);
    setStatusMessage('');

    try {
      const deviceName =
        normalizeOptionalText('Yeen TV App', TV_PAIRING_DEVICE_NAME_MAX_LENGTH)
        ?? 'Yeen TV';
      const devicePlatform = normalizeOptionalText(
        window.navigator.userAgent,
        TV_PAIRING_DEVICE_PLATFORM_MAX_LENGTH,
      );
      const response = await requestTvPairingCode({
        clientId: getOrCreateTvPairingClientId(),
        deviceName,
        devicePlatform,
      });

      setPairing(response);
      setSecondsRemaining(secondsUntil(response.expiresAt));
      setStatusMessage('Waiting for approval from your other device.');
    } catch (requestError) {
      setPairing(null);
      setError(
        toApiErrorMessage(
          requestError,
          `Unable to reach ${activeApiBase}. Update the server URL and try again.`,
        ),
      );
    } finally {
      setLoadingPairing(false);
    }
  }, [activeApiBase]);

  function handleSaveServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = setRuntimeApiBaseUrl(apiBaseInput);
    if (!normalized) {
      setError('Enter a valid server URL, for example https://yeen.f0x.app/api.');
      return;
    }

    setApiBaseInput(normalized);
    setActiveApiBase(normalized);
    setPairing(null);
    setError(null);
    setStatusMessage(`Connected to ${normalized}. Requesting a TV code...`);
    void startPairing();
  }

  function handleUseDefaultServer() {
    setRuntimeApiBaseUrl(null);
    const defaultApiBase = getConfiguredApiBaseUrl();
    setApiBaseInput(defaultApiBase);
    setActiveApiBase(defaultApiBase);
    setPairing(null);
    setError(null);
    setStatusMessage(`Using default server ${defaultApiBase}. Requesting a TV code...`);
    void startPairing();
  }

  function handlePanelFocus(event: FocusEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    });
  }

  useEffect(() => {
    document.title = 'TV Login - Yeen';
  }, []);

  useEffect(() => {
    if (hasStartedInitialPairing.current) {
      return;
    }

    hasStartedInitialPairing.current = true;
    void startPairing();
  }, [startPairing]);

  useEffect(() => {
    if (!pairing) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSecondsRemaining(secondsUntil(pairing.expiresAt));
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pairing]);

  useEffect(() => {
    if (!pairing) {
      return;
    }

    const activePairing = pairing;

    let cancelled = false;
    let terminal = false;

    async function pollOnce() {
      if (cancelled || terminal) {
        return;
      }

      try {
        const result = await pollTvPairingStatus(activePairing.pairingId, {
          pollToken: activePairing.pollToken,
        });

        if (cancelled || terminal) {
          return;
        }

        if (result.status === 'pending') {
          if (result.message) {
            setStatusMessage(result.message);
          }
          return;
        }

        if (result.status === 'approved' && result.auth) {
          terminal = true;
          setStatusMessage('Approved. Signing you in...');
          onAuthenticated(result.auth);
          return;
        }

        terminal = true;
        setError(
          result.message
            ?? 'Pairing failed. Request a new code and try again.',
        );
      } catch (pollError) {
        if (cancelled || terminal) {
          return;
        }

        terminal = true;
        setError(
          toApiErrorMessage(
            pollError,
            'Unable to check TV pairing status. Request a new code.',
          ),
        );
      }
    }

    void pollOnce();

    const pollIntervalMs = Math.max(
      1_000,
      activePairing.pollIntervalSeconds * 1_000,
    );
    const pollIntervalId = window.setInterval(() => {
      if (cancelled || terminal) {
        return;
      }

      if (secondsUntil(activePairing.expiresAt) <= 0) {
        terminal = true;
        setError('This code expired. Request a new code to continue.');
        return;
      }

      void pollOnce();
    }, pollIntervalMs);

    const timeoutId = window.setTimeout(() => {
      if (cancelled || terminal) {
        return;
      }

      terminal = true;
      setError('Timed out waiting for approval. Request a new code and try again.');
    }, Math.max(5_000, activePairing.pollTimeoutSeconds * 1_000));

    return () => {
      cancelled = true;
      window.clearInterval(pollIntervalId);
      window.clearTimeout(timeoutId);
    };
  }, [onAuthenticated, pairing]);

  return (
    <TvPageShell pageKey="tv-login">
      <main className="auth-page tv-pairing-page">
        <section className="auth-panel tv-pairing-panel" onFocusCapture={handlePanelFocus}>
          <header className="tv-pairing-header">
            <p className="eyebrow">Yeen for TV</p>
            <h1>Sign In with a Code</h1>
            <p className="subline">
              On another device, open Settings → TV Login and enter the code below.
            </p>
          </header>

          <div className="tv-pairing-layout">
            <div className="tv-pairing-primary">
              {pairing ? (
                <p className="tv-pairing-code" aria-live="polite">{formatCode(pairing.code)}</p>
              ) : (
                <p className="tv-pairing-code is-loading">Generating code…</p>
              )}

              <div className="tv-pairing-meta">
                <p className="tv-pairing-countdown">
                  Expires in {formatCountdown(displayedSecondsRemaining)}
                </p>
                {statusMessage ? <p className="scan-success">{statusMessage}</p> : null}
                {error ? <p className="error-text">{error}</p> : null}
              </div>

              <div className="tv-pairing-actions" data-tv-focus-lane-id="pairing-actions">
                <button
                  type="button"
                  onClick={() => {
                    void startPairing();
                  }}
                  autoFocus
                  data-tv-initial-focus
                  data-tv-focus-key="request-code"
                  disabled={loadingPairing}
                >
                  {loadingPairing ? 'Generating…' : 'New Code'}
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  data-tv-focus-key="password-login"
                  onClick={onUsePasswordLogin}
                >
                  Password Login
                </button>
              </div>
            </div>

            <aside className="tv-pairing-server-card" aria-label="Server connection">
              <div>
                <p className="eyebrow">Server</p>
                <p className="tv-pairing-server-help">Change this only when connecting to another Yeen server.</p>
              </div>

              <form className="auth-form tv-pairing-server-form" onSubmit={handleSaveServer}>
                <label>
                  Server URL
                  <input
                    type="text"
                    value={apiBaseInput}
                    onChange={(event) => setApiBaseInput(event.target.value)}
                    placeholder="https://yeen.f0x.app/api"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-tv-focus-key="server-url"
                  />
                </label>

                <div className="tv-pairing-server-actions">
                  <button type="submit" data-tv-focus-key="connect-server" disabled={loadingPairing}>
                    Connect
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    data-tv-focus-key="default-server"
                    onClick={handleUseDefaultServer}
                    disabled={loadingPairing}
                  >
                    Use Default
                  </button>
                </div>
              </form>

              <p className="tv-pairing-active-server">Connected to {activeApiBase}</p>
            </aside>
          </div>
        </section>
      </main>
    </TvPageShell>
  );
}
