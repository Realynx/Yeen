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
} from "react";
import {
  absoluteApiUrl,
  getBroadcastSession,
  setBroadcastEnabled,
  toApiErrorMessage,
  updateBroadcastPlayback,
  updateBroadcastSource,
} from "../../shared/services/api";
import type {
  BroadcastOwnerSession,
  BroadcastPlaybackUpdate,
  BroadcastSourceUpdate,
  BroadcastViewerStatus,
} from "../../shared/services/types";

interface BroadcastContextValue {
  session: BroadcastOwnerSession | null;
  isEnabled: boolean;
  viewerCount: number;
  viewers: BroadcastViewerStatus[];
  shareToken: string | null;
  publicWatchUrl: string | null;
  directStreamUrl: string | null;
  loading: boolean;
  updatingEnabled: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  setEnabled: (nextEnabled: boolean) => Promise<void>;
  toggleEnabled: () => Promise<void>;
  copyPublicWatchUrl: () => Promise<boolean>;
  copyDirectStreamUrl: () => Promise<boolean>;
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

  if (typeof window === "undefined") {
    return `/watch/${encodedToken}`;
  }

  return `${window.location.origin}/watch/${encodedToken}`;
}

function resolveDirectStreamUrl(shareToken: string | null): string | null {
  if (!shareToken) {
    return null;
  }

  const encodedToken = encodeURIComponent(shareToken);
  const candidateUrl = absoluteApiUrl(
    `/broadcast/public/${encodedToken}/direct/master.m3u8`,
  );

  if (/^https?:\/\//i.test(candidateUrl) || typeof window === "undefined") {
    return candidateUrl;
  }

  try {
    return new URL(candidateUrl, window.location.origin).toString();
  } catch {
    const path = candidateUrl.startsWith("/")
      ? candidateUrl
      : `/${candidateUrl}`;
    return `${window.location.origin}${path}`;
  }
}

function toSourceUpdateKey(payload: BroadcastSourceUpdate): string {
  return [
    payload.mediaId ?? "",
    payload.hlsSessionId ?? "",
    payload.subtitleFileName ?? "",
    payload.subtitleFontPreset ?? "",
    payload.selectedAudioStreamIndex ?? "",
    payload.maxVideoBitrateKbps ?? "",
    payload.audioBitrateKbps ?? "",
    payload.maxOutputHeight ?? "",
  ].join("|");
}

function toPlaybackUpdateKey(payload: BroadcastPlaybackUpdate): string {
  const clampedPosition = Math.max(0, payload.positionSeconds);
  const decisecondBucket = Math.floor(clampedPosition * 10);
  const stateLabel = payload.playbackIsPlaying ? "playing" : "paused";
  const activePlayerLabel = payload.activePlayer ? "active" : "inactive";
  const syncTimestampBucket =
    typeof payload.syncTimestampMs === "number" &&
    Number.isFinite(payload.syncTimestampMs)
      ? Math.floor(payload.syncTimestampMs / 1000)
      : 0;

  return `${stateLabel}|${activePlayerLabel}|${decisecondBucket}|${syncTimestampBucket}`;
}

const defaultContextValue: BroadcastContextValue = {
  session: null,
  isEnabled: false,
  viewerCount: 0,
  viewers: [],
  shareToken: null,
  publicWatchUrl: null,
  directStreamUrl: null,
  loading: false,
  updatingEnabled: false,
  error: null,
  refreshSession: async () => {},
  setEnabled: async () => {},
  toggleEnabled: async () => {},
  copyPublicWatchUrl: async () => false,
  copyDirectStreamUrl: async () => false,
  updateSource: async () => {},
  updatePlayback: async () => {},
};

const BroadcastContext =
  createContext<BroadcastContextValue>(defaultContextValue);

export function BroadcastProvider({ token, children }: BroadcastProviderProps) {
  const [session, setSession] = useState<BroadcastOwnerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingEnabled, setUpdatingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<BroadcastOwnerSession | null>(null);
  const lastSourceKeyRef = useRef("");
  const lastPlaybackKeyRef = useRef("");
  const sourceMutationTailRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = await getBroadcastSession(token);
      sessionRef.current = nextSession;
      setSession(nextSession);
      setError(null);
    } catch (refreshError) {
      setError(
        toApiErrorMessage(refreshError, "Unable to refresh broadcast status."),
      );
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

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      setUpdatingEnabled(true);

      try {
        const nextSession = await setBroadcastEnabled(token, nextEnabled);
        sessionRef.current = nextSession;
        setSession(nextSession);
        setError(null);
        lastSourceKeyRef.current = "";
        lastPlaybackKeyRef.current = "";
      } catch (toggleError) {
        setError(
          toApiErrorMessage(toggleError, "Unable to update broadcast mode."),
        );
      } finally {
        setUpdatingEnabled(false);
      }
    },
    [token],
  );

  const toggleEnabled = useCallback(async () => {
    const currentlyEnabled = Boolean(sessionRef.current?.enabled);
    await setEnabled(!currentlyEnabled);
  }, [setEnabled]);

  const updateSource = useCallback(
    async (payload: BroadcastSourceUpdate | null) => {
      const activeSession = sessionRef.current;
      if (!activeSession?.enabled) {
        return;
      }

      const normalizedPayload: BroadcastSourceUpdate = payload ?? {
        mediaId: null,
        hlsSessionId: null,
        subtitleFileName: null,
        subtitleFontPreset: null,
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

      const mutation = sourceMutationTailRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const nextSession = await updateBroadcastSource(
              token,
              normalizedPayload,
            );
            sessionRef.current = nextSession;
            setSession(nextSession);
            setError(null);
          } catch (updateError) {
            if (lastSourceKeyRef.current === nextKey) {
              lastSourceKeyRef.current = "";
            }
            setError(
              toApiErrorMessage(
                updateError,
                "Unable to update broadcast source.",
              ),
            );
          }
        });
      sourceMutationTailRef.current = mutation;
      await mutation;
    },
    [token],
  );

  const updatePlayback = useCallback(
    async (payload: BroadcastPlaybackUpdate) => {
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
        const nextSession = await updateBroadcastPlayback(
          token,
          normalizedPayload,
        );
        sessionRef.current = nextSession;
        setSession(nextSession);
        setError(null);
      } catch (updateError) {
        lastPlaybackKeyRef.current = "";
        setError(
          toApiErrorMessage(updateError, "Unable to sync broadcast playback."),
        );
      }
    },
    [token],
  );

  const publicWatchUrl = useMemo(() => {
    return resolvePublicWatchUrl(session?.shareToken ?? null);
  }, [session?.shareToken]);

  const directStreamUrl = useMemo(() => {
    return resolveDirectStreamUrl(session?.shareToken ?? null);
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

  const copyDirectStreamUrl = useCallback(async () => {
    if (!directStreamUrl) {
      return false;
    }

    if (!navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(directStreamUrl);
      return true;
    } catch {
      return false;
    }
  }, [directStreamUrl]);

  const value = useMemo<BroadcastContextValue>(() => {
    const isEnabled = Boolean(session?.enabled);
    return {
      session,
      isEnabled,
      viewerCount: session?.viewerCount ?? 0,
      viewers: session?.viewers ?? [],
      shareToken: session?.shareToken ?? null,
      publicWatchUrl,
      directStreamUrl,
      loading,
      updatingEnabled,
      error,
      refreshSession,
      setEnabled,
      toggleEnabled,
      copyPublicWatchUrl,
      copyDirectStreamUrl,
      updateSource,
      updatePlayback,
    };
  }, [
    copyDirectStreamUrl,
    copyPublicWatchUrl,
    directStreamUrl,
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
