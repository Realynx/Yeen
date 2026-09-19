export const THEME_IDS = ['current', 'netflix', 'obsidian-purple'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'current';
export const THEME_STORAGE_KEY_PREFIX = 'yeen_theme_preference_v1:';

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ThemeEventTarget {
  localStorage: ThemeStorage;
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
  removeEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
}

interface ThemeRoot {
  dataset: DOMStringMap;
}

interface ThemePreferenceEnvironment {
  target?: ThemeEventTarget;
  root?: ThemeRoot;
}

function browserTarget(): ThemeEventTarget | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function browserStorage(): ThemeStorage | undefined {
  try {
    return browserTarget()?.localStorage;
  } catch {
    return undefined;
  }
}

function documentRoot(): ThemeRoot | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement;
}

export function normalizeThemeId(value: unknown): ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId)
    ? value as ThemeId
    : DEFAULT_THEME_ID;
}

export function themePreferenceStorageKey(accountId: string): string | null {
  const normalizedAccountId = accountId.trim();
  return normalizedAccountId
    ? `${THEME_STORAGE_KEY_PREFIX}${encodeURIComponent(normalizedAccountId)}`
    : null;
}

export function applyThemePreference(
  themeId: unknown,
  root: ThemeRoot | undefined = documentRoot(),
): ThemeId {
  const normalized = normalizeThemeId(themeId);
  if (root) {
    root.dataset.yeenTheme = normalized;
  }
  return normalized;
}

export function readThemePreference(
  accountId: string,
  storage: ThemeStorage | undefined = browserStorage(),
): ThemeId {
  const key = themePreferenceStorageKey(accountId);
  if (!key || !storage) {
    return DEFAULT_THEME_ID;
  }

  try {
    return normalizeThemeId(storage.getItem(key));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeThemePreference(
  accountId: string,
  themeId: unknown,
  environment: ThemePreferenceEnvironment = {},
): ThemeId {
  const normalized = normalizeThemeId(themeId);
  const target = environment.target ?? browserTarget();
  const key = themePreferenceStorageKey(accountId);

  if (key && target) {
    try {
      target.localStorage.setItem(key, normalized);
    } catch {
      // Applying the preference remains useful when browser storage is blocked.
    }
  }

  return applyThemePreference(normalized, environment.root ?? documentRoot());
}

export function activateThemePreference(
  accountId: string,
  onChange?: (themeId: ThemeId) => void,
  environment: ThemePreferenceEnvironment = {},
): () => void {
  const target = environment.target ?? browserTarget();
  const root = environment.root ?? documentRoot();
  const key = themePreferenceStorageKey(accountId);
  let storage: ThemeStorage | undefined;
  try {
    storage = target?.localStorage;
  } catch {
    storage = undefined;
  }
  const initialTheme = readThemePreference(accountId, storage);
  applyThemePreference(initialTheme, root);
  onChange?.(initialTheme);

  if (!target || !key) {
    return () => undefined;
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== key) {
      return;
    }

    const nextTheme = applyThemePreference(event.newValue, root);
    onChange?.(nextTheme);
  }

  target.addEventListener('storage', handleStorage);
  return () => target.removeEventListener('storage', handleStorage);
}
