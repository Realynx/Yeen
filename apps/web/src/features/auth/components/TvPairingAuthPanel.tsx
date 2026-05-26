import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent, FormEvent } from 'react';
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
import './TvPairingAuthPanel.css';

const TV_PAIRING_CLIENT_ID_STORAGE_KEY = 'yeen_tv_pairing_client_id';
const TV_PAIRING_CLIENT_ID_MIN_LENGTH = 6;
const TV_PAIRING_CLIENT_ID_MAX_LENGTH = 128;
const TV_PAIRING_DEVICE_NAME_MAX_LENGTH = 64;
const TV_PAIRING_DEVICE_PLATFORM_MAX_LENGTH = 160;

interface TvPairingAuthPanelProps {
  onAuthenticated: (response: AuthResponse) => void;
  onUsePasswordLogin: () => void;
}

function secondsUntil(expiresAt: string): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/(.{3})/g, '$1 ')
    .trim();
}

function createClientId(): string {
  const cryptoObject = window.crypto as Crypto | undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  return `tv-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | undefined {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

function isValidTvPairingClientId(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length >= TV_PAIRING_CLIENT_ID_MIN_LENGTH
    && normalized.length <= TV_PAIRING_CLIENT_ID_MAX_LENGTH
  );
}

function createValidTvPairingClientId(): string {
  const candidate = createClientId().trim();
  if (isValidTvPairingClientId(candidate)) {
    return candidate;
  }

  return `tv-${Math.random().toString(36).slice(2, 14)}`;
}

function getOrCreateTvPairingClientId(): string {
  try {
    const existing = window.localStorage
      .getItem(TV_PAIRING_CLIENT_ID_STORAGE_KEY)
      ?.trim();
    if (existing && isValidTvPairingClientId(existing)) {
      return existing;
    }

    const created = createValidTvPairingClientId();
    window.localStorage.setItem(TV_PAIRING_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return createValidTvPairingClientId();
  }
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
      setStatusMessage(
        'Open Yeen on your phone or computer, then enter this code in Settings -> TV Login.',
      );
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
      setSecondsRemaining(0);
      return;
    }

    setSecondsRemaining(secondsUntil(pairing.expiresAt));
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
    <main className="auth-page tv-pairing-page">
      <section className="auth-panel tv-pairing-panel" onFocusCapture={handlePanelFocus}>
        <p className="eyebrow">Yeen for TV</p>
        <h1>Sign In with a Code</h1>
        <p className="subline">
          Enter this code in your profile settings from another device.
        </p>

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
            />
          </label>

          <div className="tv-pairing-server-actions">
            <button type="submit" disabled={loadingPairing}>
              Save and Connect
            </button>

            <button
              type="button"
              className="ghost-button"
              onClick={handleUseDefaultServer}
              disabled={loadingPairing}
            >
              Use Default Server
            </button>
          </div>
        </form>

        <p className="tv-pairing-active-server">Active server: {activeApiBase}</p>

        {pairing ? (
          <p className="tv-pairing-code" aria-live="polite">{formatCode(pairing.code)}</p>
        ) : (
          <p className="subline">Generating pairing code...</p>
        )}

        <div className="tv-pairing-meta">
          <p className="tv-pairing-countdown">Code expires in {formatCountdown(secondsRemaining)}</p>
          {statusMessage ? <p className="scan-success">{statusMessage}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="tv-pairing-actions">
          <button
            type="button"
            onClick={() => {
              void startPairing();
            }}
            autoFocus
            disabled={loadingPairing}
          >
            {loadingPairing ? 'Generating...' : 'Request New Code'}
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={onUsePasswordLogin}
          >
            Use Email and Password
          </button>
        </div>
      </section>
    </main>
  );
}
