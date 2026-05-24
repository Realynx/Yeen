/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  getBroadcastSession,
  setBroadcastEnabled,
  toApiErrorMessage,
  updateBroadcastPlayback,
  updateBroadcastSource,
} from '../../shared/services/api';
import type {
  BroadcastOwnerSession,
  BroadcastPlaybackUpdate,
  BroadcastSourceUpdate,
} from '../../shared/services/types';

interface BroadcastContextValue {
  session: BroadcastOwnerSession | null;
  isEnabled: boolean;
  viewerCount: number;
  shareToken: string | null;
  publicWatchUrl: string | null;
  loading: boolean;
  updatingEnabled: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  setEnabled: (nextEnabled: boolean) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  copyPublicWatchUrl: () => Promise<boolean>;
  updateSource: (payload: BroadcastSourceUpdate | null) => Promise<void>;
  updatePlayback: (payload: BroadcastPlaybackUpdate) => Promise<void>;
}

interface BroadcastProviderProps {
  token: string;
  children: ReactNode;
}

function resolvePublicWatchUrl(shareToken: string | null): string | null {
  if (!shareToken) {
    return null;
  }

  const encodedToken = encodeURIComponent(shareToken);

  if (typeof window === 'undefined') {
    return `/watch/${encodedToken}`;
  }

  return `${window.location.origin}/watch/${encodedToken}`;
}

function toSourceUpdateKey(payload: BroadcastSourceUpdate): string {
  return [
    payload.mediaId ?? '',
    payload.hlsSessionId ?? '',
    payload.subtitleFileName ?? '',
    payload.selectedAudioStreamIndex ?? '',
    payload.maxVideoBitrateKbps ?? '',
    payload.audioBitrateKbps ?? '',
    payload.maxOutputHeight ?? '',
  ].join('|');
}

function toPlaybackUpdateKey(payload: BroadcastPlaybackUpdate): string {
  const clampedPosition = Math.max(0, payload.positionSeconds);
  const secondBucket = Math.floor(clampedPosition);
  const stateLabel = payload.playbackIsPlaying ? 'playing' : 'paused';
  const activePlayerLabel = payload.activePlayer ? 'active' : 'inactive';
  return `${stateLabel}|${activePlayerLabel}|${secondBucket}`;
}

const defaultContextValue: BroadcastContextValue = {
  session: null,
  isEnabled: false,
  viewerCount: 0,
  shareToken: null,
  publicWatchUrl: null,
  loading: false,
  updatingEnabled: false,
  error: null,
  refreshSession: async () => {},
  setEnabled: async () => {},
  toggleEnabled: async () => {},
  copyPublicWatchUrl: async () => false,
  updateSource: async () => {},
  updatePlayback: async () => {},
};

const BroadcastContext = createContext<BroadcastContextValue>(defaultContextValue);

export function BroadcastProvider({ token, children }: BroadcastProviderProps) {
  const location = useLocation();
  const [session, setSession] = useState<BroadcastOwnerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingEnabled, setUpdatingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<BroadcastOwnerSession | null>(null);
  const lastSourceKeyRef = useRef('');
  const lastPlaybackKeyRef = useRef('');
  const lastIdlePathRef = useRef<string | null>(null);
  const lastPlaybackSyncAtRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = await getBroadcastSession(token);
      sessionRef.current = nextSession;
      setSession(nextSession);
      const parsedPlaybackUpdatedAt = Date.parse(
        nextSession.playbackUpdatedAt ?? '',
      );
      if (Number.isFinite(parsedPlaybackUpdatedAt)) {
        lastPlaybackSyncAtRef.current = parsedPlaybackUpdatedAt;
      }
      setError(null);
    } catch (refreshError) {
      setError(toApiErrorMessage(refreshError, 'Unable to refresh broadcast status.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!session?.enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshSession();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSession, session?.enabled]);

  const setEnabled = useCallback(async (nextEnabled: boolean) => {
    setUpdatingEnabled(true);

    try {
      const nextSession = await setBroadcastEnabled(token, nextEnabled);
      sessionRef.current = nextSession;
      setSession(nextSession);
      setError(null);
      lastSourceKeyRef.current = '';
      lastPlaybackKeyRef.current = '';
      lastIdlePathRef.current = null;
      if (!nextSession.enabled) {
        lastPlaybackSyncAtRef.current = 0;
      }
    } catch (toggleError) {
      setError(toApiErrorMessage(toggleError, 'Unable to update broadcast mode.'));
    } finally {
      setUpdatingEnabled(false);
    }
  }, [token]);

  const toggleEnabled = useCallback(async () => {
    const currentlyEnabled = Boolean(sessionRef.current?.enabled);
    await setEnabled(!currentlyEnabled);
  }, [setEnabled]);

  const updateSource = useCallback(async (payload: BroadcastSourceUpdate | null) => {
    const activeSession = sessionRef.current;
    if (!activeSession?.enabled) {
      return;
    }

    const normalizedPayload: BroadcastSourceUpdate = payload ?? {
      mediaId: null,
      hlsSessionId: null,
      subtitleFileName: null,
      selectedAudioStreamIndex: null,
      maxVideoBitrateKbps: null,
      audioBitrateKbps: null,
      maxOutputHeight: null,
    };

    const nextKey = toSourceUpdateKey(normalizedPayload);
    if (lastSourceKeyRef.current === nextKey) {
      return;
    }

    lastSourceKeyRef.current = nextKey;

    try {
      const nextSession = await updateBroadcastSource(token, normalizedPayload);
      sessionRef.current = nextSession;
      setSession(nextSession);
      setError(null);
    } catch (updateError) {
      lastSourceKeyRef.current = '';
      setError(toApiErrorMessage(updateError, 'Unable to update broadcast source.'));
    }
  }, [token]);

  const updatePlayback = useCallback(async (payload: BroadcastPlaybackUpdate) => {
    const activeSession = sessionRef.current;
    if (!activeSession?.enabled) {
      return;
    }

    const normalizedPayload: BroadcastPlaybackUpdate = {
      positionSeconds: Math.max(0, payload.positionSeconds),
      playbackIsPlaying: Boolean(payload.playbackIsPlaying),
      activePlayer: Boolean(payload.activePlayer),
      syncTimestampMs: payload.syncTimestampMs,
    };

    const nextKey = toPlaybackUpdateKey(normalizedPayload);
    if (lastPlaybackKeyRef.current === nextKey) {
      return;
    }

    lastPlaybackKeyRef.current = nextKey;

    try {
      const nextSession = await updateBroadcastPlayback(token, normalizedPayload);
      sessionRef.current = nextSession;
      setSession(nextSession);
      lastPlaybackSyncAtRef.current = Date.now();
      setError(null);
    } catch (updateError) {
      lastPlaybackKeyRef.current = '';
      setError(toApiErrorMessage(updateError, 'Unable to sync broadcast playback.'));
    }
  }, [token]);

  useEffect(() => {
    if (!session?.enabled) {
      lastIdlePathRef.current = null;
      return;
    }

    if (location.pathname.startsWith('/player/')) {
      lastIdlePathRef.current = null;
      return;
    }

    if (lastIdlePathRef.current === location.pathname) {
      return;
    }

    lastIdlePathRef.current = location.pathname;

    void updatePlayback({
      positionSeconds: session.playbackPositionSeconds,
      playbackIsPlaying: false,
      activePlayer: false,
      syncTimestampMs: Date.now(),
    });
  }, [location.pathname, session?.enabled, session?.playbackPositionSeconds, updatePlayback]);

  useEffect(() => {
    if (!session?.enabled) {
      return;
    }

    if (location.pathname.startsWith('/player/')) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeSession = sessionRef.current;
      if (!activeSession?.enabled) {
        return;
      }

      const elapsedMs = Date.now() - lastPlaybackSyncAtRef.current;
      if (elapsedMs <= 5500) {
        return;
      }

      void updatePlayback({
        positionSeconds: activeSession.playbackPositionSeconds,
        playbackIsPlaying: false,
        activePlayer: false,
        syncTimestampMs: Date.now(),
      });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [location.pathname, session?.enabled, updatePlayback]);

  const publicWatchUrl = useMemo(() => {
    return resolvePublicWatchUrl(session?.shareToken ?? null);
  }, [session?.shareToken]);

  const copyPublicWatchUrl = useCallback(async () => {
    if (!publicWatchUrl) {
      return false;
    }

    if (!navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(publicWatchUrl);
      return true;
    } catch {
      return false;
    }
  }, [publicWatchUrl]);

  const value = useMemo<BroadcastContextValue>(() => {
    const isEnabled = Boolean(session?.enabled);
    return {
      session,
      isEnabled,
      viewerCount: session?.viewerCount ?? 0,
      shareToken: session?.shareToken ?? null,
      publicWatchUrl,
      loading,
      updatingEnabled,
      error,
      refreshSession,
      setEnabled,
      toggleEnabled,
      copyPublicWatchUrl,
      updateSource,
      updatePlayback,
    };
  }, [
    copyPublicWatchUrl,
    error,
    loading,
    publicWatchUrl,
    refreshSession,
    session,
    setEnabled,
    toggleEnabled,
    updatePlayback,
    updateSource,
    updatingEnabled,
  ]);

  return (
    <BroadcastContext.Provider value={value}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcast() {
  return useContext(BroadcastContext);
}
