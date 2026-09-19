import { useCallback, useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  getPublicBroadcastSession,
  heartbeatPublicBroadcastViewer,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { BroadcastStatusSnapshot } from '../services/publicBroadcastPlaybackSync';
import { openPublicBroadcastStatusStream } from '../services/publicBroadcastStatusStream';
import { shouldRefreshPublicBroadcastFallback } from '../services/publicBroadcastStatusFallback';
import {
  HEARTBEAT_INTERVAL_MS,
  STATUS_FALLBACK_INTERVAL_MS,
} from './publicBroadcastPage.constants';

interface UsePublicBroadcastSessionPollingOptions {
  resolvedShareToken: string;
  setStatusSnapshot: Dispatch<SetStateAction<BroadcastStatusSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  statusRef: RefObject<BroadcastStatusSnapshot | null>;
  runPlaybackSyncRef: RefObject<() => void>;
}

export function usePublicBroadcastSessionPolling({
  resolvedShareToken,
  setStatusSnapshot,
  setLoading,
  setError,
  statusRef,
  runPlaybackSyncRef,
}: UsePublicBroadcastSessionPollingOptions) {
  const viewerStorageKey = useMemo(() => {
    if (!resolvedShareToken) {
      return null;
    }

    return `yeen_public_broadcast_viewer_${resolvedShareToken}`;
  }, [resolvedShareToken]);

  const ensureViewerId = useCallback(() => {
    if (!viewerStorageKey) {
      return '';
    }

    const storedViewerId = localStorage.getItem(viewerStorageKey)?.trim() ?? '';
    if (storedViewerId) {
      return storedViewerId;
    }

    const generatedViewerId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

    localStorage.setItem(viewerStorageKey, generatedViewerId);
    return generatedViewerId;
  }, [viewerStorageKey]);

  useEffect(() => {
    if (!resolvedShareToken) {
      return;
    }

    let cancelled = false;
    let lastStreamStatusAtMs = 0;

    function applyStatus(nextStatus: BroadcastStatusSnapshot['status']) {
      const nextSnapshot: BroadcastStatusSnapshot = {
        status: nextStatus,
        receivedAtMs: Date.now(),
      };
      statusRef.current = nextSnapshot;
      setStatusSnapshot(nextSnapshot);
      setError(null);
      runPlaybackSyncRef.current();
    }

    async function refreshStatus() {
      try {
        const nextStatus = await getPublicBroadcastSession(resolvedShareToken);
        if (cancelled) {
          return;
        }
        applyStatus(nextStatus);
      } catch (statusError) {
        if (!cancelled) {
          setError(toApiErrorMessage(statusError, 'Unable to load broadcast status.'));
          runPlaybackSyncRef.current();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refreshStatus();
    const closeStatusStream = openPublicBroadcastStatusStream(
      resolvedShareToken,
      (nextStatus) => {
        if (!cancelled) {
          lastStreamStatusAtMs = Date.now();
          applyStatus(nextStatus);
          setLoading(false);
        }
      },
    );

    const intervalId = window.setInterval(() => {
      if (shouldRefreshPublicBroadcastFallback(lastStreamStatusAtMs, Date.now())) {
        void refreshStatus();
      }
    }, STATUS_FALLBACK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      closeStatusStream();
    };
  }, [resolvedShareToken, runPlaybackSyncRef, setError, setLoading, setStatusSnapshot, statusRef]);

  useEffect(() => {
    if (!resolvedShareToken) {
      return;
    }

    let cancelled = false;

    async function sendHeartbeat() {
      try {
        const viewerId = ensureViewerId();
        if (!viewerId) {
          return;
        }

        const heartbeat = await heartbeatPublicBroadcastViewer(
          resolvedShareToken,
          viewerId,
        );

        if (cancelled) {
          return;
        }

        setStatusSnapshot((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: {
              ...previous.status,
              viewerCount: heartbeat.viewerCount,
            },
          };
        });
      } catch {
        // Keep stream status polling resilient even when heartbeat fails.
      }
    }

    void sendHeartbeat();

    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [ensureViewerId, resolvedShareToken, setStatusSnapshot]);
}
