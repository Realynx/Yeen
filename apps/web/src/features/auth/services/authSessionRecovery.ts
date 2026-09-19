import { ApiError } from '../../shared/services/api';
import type { User, UserRole } from '../../shared/services/types';

const CACHED_USER_STORAGE_KEY = 'yeen_cached_authenticated_user';
const USER_ROLES = new Set<UserRole>(['admin', 'sailer', 'user']);

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
type RemoveStorage = Pick<Storage, 'removeItem'>;

export function shouldInvalidateAuthenticatedSession(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function readCachedAuthenticatedUser(storage?: ReadStorage): User | null {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return null;
  }

  try {
    const raw = targetStorage.getItem(CACHED_USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeCachedUser(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeCachedAuthenticatedUser(user: User, storage?: WriteStorage): void {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.setItem(CACHED_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Session recovery remains optional when browser storage is unavailable.
  }
}

export function clearCachedAuthenticatedUser(storage?: RemoveStorage): void {
  const targetStorage = storage ?? safeLocalStorage();
  if (!targetStorage) {
    return;
  }

  try {
    targetStorage.removeItem(CACHED_USER_STORAGE_KEY);
  } catch {
    // A failed cache cleanup must not block logout.
  }
}

function normalizeCachedUser(value: unknown): User | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const user = value as Partial<User>;
  if (
    typeof user.id !== 'string'
    || !user.id.trim()
    || typeof user.email !== 'string'
    || typeof user.name !== 'string'
    || !USER_ROLES.has(user.role as UserRole)
    || typeof user.createdAt !== 'string'
  ) {
    return null;
  }

  return user as User;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
