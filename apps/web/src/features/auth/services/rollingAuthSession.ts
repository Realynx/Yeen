import type { AuthResponse } from '../../shared/services/types';

export const SESSION_REFRESH_WINDOW_MS = 60 * 60 * 1000;
export const SESSION_REFRESH_RETRY_DELAY_MS = 60 * 1000;

interface JwtPayload {
  exp?: unknown;
}

interface RollingSessionRefresherOptions {
  getToken: () => string;
  refresh: (token: string) => Promise<AuthResponse>;
  onRefreshed: (response: AuthResponse) => void;
  now?: () => number;
  refreshWindowMs?: number;
  retryDelayMs?: number;
}

export interface RollingSessionRefresher {
  refreshIfNeeded: () => Promise<boolean>;
}

export function accessTokenExpiresAtMs(token: string): number | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(payloadSegment)) as JwtPayload;
    const expirySeconds = typeof payload.exp === 'number' ? payload.exp : Number.NaN;
    return Number.isFinite(expirySeconds) ? expirySeconds * 1000 : null;
  } catch {
    return null;
  }
}

export function shouldRefreshAccessToken(
  token: string,
  nowMs = Date.now(),
  refreshWindowMs = SESSION_REFRESH_WINDOW_MS,
): boolean {
  const expiresAtMs = accessTokenExpiresAtMs(token);
  return expiresAtMs !== null
    && expiresAtMs > nowMs
    && expiresAtMs - nowMs <= refreshWindowMs;
}

export function createRollingSessionRefresher({
  getToken,
  refresh,
  onRefreshed,
  now = Date.now,
  refreshWindowMs = SESSION_REFRESH_WINDOW_MS,
  retryDelayMs = SESSION_REFRESH_RETRY_DELAY_MS,
}: RollingSessionRefresherOptions): RollingSessionRefresher {
  let refreshInFlight: Promise<boolean> | null = null;
  let nextAttemptAtMs = 0;

  return {
    refreshIfNeeded() {
      const token = getToken();
      const nowMs = now();
      if (
        refreshInFlight
        || nowMs < nextAttemptAtMs
        || !shouldRefreshAccessToken(token, nowMs, refreshWindowMs)
      ) {
        return refreshInFlight ?? Promise.resolve(false);
      }

      nextAttemptAtMs = nowMs + retryDelayMs;
      refreshInFlight = refresh(token)
        .then((response) => {
          onRefreshed(response);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    },
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  return atob(padded);
}
