const TV_PAIRING_CLIENT_ID_STORAGE_KEY = 'yeen_tv_pairing_client_id';
const TV_PAIRING_CLIENT_ID_MIN_LENGTH = 6;
const TV_PAIRING_CLIENT_ID_MAX_LENGTH = 128;

export const TV_PAIRING_DEVICE_NAME_MAX_LENGTH = 64;
export const TV_PAIRING_DEVICE_PLATFORM_MAX_LENGTH = 160;

export function secondsUntil(expiresAt: string): number {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatCode(code: string): string {
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

export function normalizeOptionalText(
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

export function getOrCreateTvPairingClientId(): string {
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
