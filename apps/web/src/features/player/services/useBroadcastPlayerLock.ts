import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BROADCAST_PLAYER_LOCK_RENEW_MS = 2000;
const BROADCAST_PLAYER_LOCK_TTL_MS = 6500;

interface UseBroadcastPlayerLockOptions {
  broadcastEnabled: boolean;
  userId: string;
  mediaId: string;
}

interface BroadcastPlayerLockResult {
  hasBroadcastPlayerLock: boolean;
  hasValidBroadcastPlayerLockOwnership: () => boolean;
}

export function useBroadcastPlayerLock({
  broadcastEnabled,
  userId,
  mediaId,
}: UseBroadcastPlayerLockOptions): BroadcastPlayerLockResult {
  const [hasBroadcastPlayerLock, setHasBroadcastPlayerLock] = useState(false);
  const broadcastPlayerInstanceIdRef = useRef<string | null>(null);

  const broadcastPlayerLockKey = useMemo(() => {
    return `yeen_broadcast_player_lock_${userId}`;
  }, [userId]);

  const ensureBroadcastPlayerInstanceId = useCallback((): string => {
    if (broadcastPlayerInstanceIdRef.current) {
      return broadcastPlayerInstanceIdRef.current;
    }

    broadcastPlayerInstanceIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

    return broadcastPlayerInstanceIdRef.current;
  }, []);

  const acquireBroadcastPlayerLock = useCallback((): boolean => {
    if (typeof window === 'undefined') {
      return true;
    }

    const nowMs = Date.now();
    const instanceId = ensureBroadcastPlayerInstanceId();

    let lockHolderInstanceId: string | null = null;
    let lockExpiresAt = 0;

    try {
      const raw = window.localStorage.getItem(broadcastPlayerLockKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          instanceId?: unknown;
          expiresAt?: unknown;
        };

        if (typeof parsed.instanceId === 'string') {
          lockHolderInstanceId = parsed.instanceId;
        }

        if (typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)) {
          lockExpiresAt = parsed.expiresAt;
        }
      }
    } catch {
      lockHolderInstanceId = null;
      lockExpiresAt = 0;
    }

    const lockBelongsToOtherActiveInstance =
      lockHolderInstanceId !== null
      && lockHolderInstanceId !== instanceId
      && lockExpiresAt > nowMs;

    if (lockBelongsToOtherActiveInstance) {
      return false;
    }

    window.localStorage.setItem(
      broadcastPlayerLockKey,
      JSON.stringify({
        instanceId,
        mediaId,
        expiresAt: nowMs + BROADCAST_PLAYER_LOCK_TTL_MS,
      }),
    );

    return true;
  }, [broadcastPlayerLockKey, ensureBroadcastPlayerInstanceId, mediaId]);

  const hasValidBroadcastPlayerLockOwnership = useCallback((): boolean => {
    if (typeof window === 'undefined') {
      return true;
    }

    const instanceId = ensureBroadcastPlayerInstanceId();

    try {
      const raw = window.localStorage.getItem(broadcastPlayerLockKey);
      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw) as {
        instanceId?: unknown;
        expiresAt?: unknown;
      };

      if (parsed.instanceId !== instanceId) {
        return false;
      }

      return (
        typeof parsed.expiresAt === 'number'
        && Number.isFinite(parsed.expiresAt)
        && parsed.expiresAt > Date.now()
      );
    } catch {
      return false;
    }
  }, [broadcastPlayerLockKey, ensureBroadcastPlayerInstanceId]);

  const releaseBroadcastPlayerLock = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const instanceId = ensureBroadcastPlayerInstanceId();

    try {
      const raw = window.localStorage.getItem(broadcastPlayerLockKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { instanceId?: unknown };
      if (parsed.instanceId === instanceId) {
        window.localStorage.removeItem(broadcastPlayerLockKey);
      }
    } catch {
      // Ignore lock parse failures and leave lock untouched.
    }
  }, [broadcastPlayerLockKey, ensureBroadcastPlayerInstanceId]);

  useEffect(() => {
    if (!broadcastEnabled) {
      releaseBroadcastPlayerLock();
      return;
    }

    let cancelled = false;

    const renewLock = () => {
      const acquired = acquireBroadcastPlayerLock();
      if (!cancelled) {
        setHasBroadcastPlayerLock(acquired);
      }
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== broadcastPlayerLockKey) {
        return;
      }

      renewLock();
    };

    renewLock();
    const intervalId = window.setInterval(renewLock, BROADCAST_PLAYER_LOCK_RENEW_MS);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleStorageEvent);
      releaseBroadcastPlayerLock();
    };
  }, [
    acquireBroadcastPlayerLock,
    broadcastEnabled,
    broadcastPlayerLockKey,
    releaseBroadcastPlayerLock,
  ]);

  return {
    hasBroadcastPlayerLock: broadcastEnabled && hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
  };
}
