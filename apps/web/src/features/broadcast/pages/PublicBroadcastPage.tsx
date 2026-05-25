import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  absoluteApiUrl,
  getPublicBroadcastSession,
  heartbeatPublicBroadcastViewer,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';
import {
  type PlaybackSyncRuntime,
  resolveBroadcastTargetPosition,
  resolveEffectiveBroadcastStatus,
  SEEK_GUARD_WINDOW_MS,
  syncVideoToBroadcastStatus,
} from '../services/publicBroadcastPlaybackSync';
import './public-broadcast-page.css';

const STATUS_POLL_INTERVAL_MS = 1800;
const HEARTBEAT_INTERVAL_MS = 15000;
const PLAYBACK_SYNC_INTERVAL_MS = 650;

interface PublicBroadcastPageProps {
  shareToken?: string;
}

export function PublicBroadcastPage({ shareToken }: PublicBroadcastPageProps) {
  const resolvedShareToken = shareToken?.trim() || '';

  const [status, setStatus] = useState<BroadcastPublicSession | null>(null);
  const [loading, setLoading] = useState(Boolean(resolvedShareToken));
  const [error, setError] = useState<string | null>(null);
  const [lastLiveSnapshot, setLastLiveSnapshot] = useState<{
    status: BroadcastPublicSession | null;
    atMs: number;
  }>({
    status: null,
    atMs: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const statusRef = useRef<BroadcastPublicSession | null>(null);
  const suppressSeekGuardUntilRef = useRef(0);
  const syncRuntimeRef = useRef<PlaybackSyncRuntime>({
    lastManifestUrl: null,
    lastManifestAppliedAtMs: 0,
    lastHardSyncAtMs: 0,
  });

  const effectiveStatus = useMemo(() => {
    return resolveEffectiveBroadcastStatus(
      status,
      lastLiveSnapshot.status,
      lastLiveSnapshot.atMs,
    );
  }, [lastLiveSnapshot.atMs, lastLiveSnapshot.status, status]);

  useEffect(() => {
    if (!status?.isLive || !status.manifestUrl) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setLastLiveSnapshot({
        status,
        atMs: Date.now(),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    statusRef.current = effectiveStatus;
  }, [effectiveStatus]);

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

    async function refreshStatus() {
      try {
        const nextStatus = await getPublicBroadcastSession(resolvedShareToken);
        if (cancelled) {
          return;
        }

        setStatus(nextStatus);
        setError(null);
      } catch (statusError) {
        if (!cancelled) {
          setError(toApiErrorMessage(statusError, 'Unable to load broadcast status.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refreshStatus();

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [resolvedShareToken]);

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

        setStatus((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            viewerCount: heartbeat.viewerCount,
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
  }, [ensureViewerId, resolvedShareToken]);

  useEffect(() => {
    const activeStatus = statusRef.current;
    const video = videoRef.current;

    if (!video || !activeStatus) {
      return;
    }
    syncVideoToBroadcastStatus(
      video,
      activeStatus,
      syncRuntimeRef,
      suppressSeekGuardUntilRef,
    );
  }, [
    status?.isLive,
    status?.manifestUrl,
    status?.playbackIsPlaying,
    status?.playbackPositionSeconds,
    status?.playbackUpdatedAt,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const activeStatus = statusRef.current;
      const video = videoRef.current;
      if (!video || !activeStatus) {
        return;
      }

      syncVideoToBroadcastStatus(
        video,
        activeStatus,
        syncRuntimeRef,
        suppressSeekGuardUntilRef,
      );
    }, PLAYBACK_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const isStandbyState = Boolean(effectiveStatus?.enabled && !effectiveStatus.isLive);
  const isLiveState = Boolean(
    effectiveStatus?.enabled
    && effectiveStatus.isLive
    && effectiveStatus.manifestUrl,
  );

  const viewerLabel = useMemo(() => {
    const viewerCount = effectiveStatus?.viewerCount ?? 0;
    if (viewerCount === 1) {
      return '1 viewer';
    }

    return `${viewerCount} viewers`;
  }, [effectiveStatus?.viewerCount]);

  function handleVideoPause() {
    const activeStatus = statusRef.current;
    const video = videoRef.current;

    if (!video || !activeStatus?.isLive || !activeStatus.playbackIsPlaying) {
      return;
    }

    void video.play().catch(() => {
      // Browser gesture rules may block autoplay retries.
    });
  }

  function handleVideoPlay() {
    const activeStatus = statusRef.current;
    const video = videoRef.current;

    if (!video || !activeStatus?.isLive || activeStatus.playbackIsPlaying) {
      return;
    }

    video.pause();
  }

  function handleVideoSeeking() {
    const activeStatus = statusRef.current;
    if (!activeStatus?.isLive) {
      return;
    }

    if (Date.now() < suppressSeekGuardUntilRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const targetPosition = resolveBroadcastTargetPosition(activeStatus);
    if (Math.abs(video.currentTime - targetPosition) > 0.75) {
      suppressSeekGuardUntilRef.current = Date.now() + SEEK_GUARD_WINDOW_MS;
      video.currentTime = targetPosition;
    }
  }

  if (!resolvedShareToken) {
    return (
      <main className="broadcast-public-page">
        <section className="broadcast-public-shell">
          <p className="error-text">Broadcast token is missing.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="broadcast-public-page">
      <section className="broadcast-public-shell">
        <header className="broadcast-public-header">
          <p className="eyebrow">YEEN Broadcast</p>
          <h1>Anonymous Stream</h1>
          <p className="broadcast-public-viewers">{viewerLabel}</p>
        </header>

        {loading ? (
          <p className="muted">Loading broadcast...</p>
        ) : null}

        {error ? (
          <p className="error-text broadcast-public-error">{error}</p>
        ) : null}

        {!loading && !status?.enabled ? (
          <section className="broadcast-offline-card" aria-live="polite">
            <h2>Broadcast is offline</h2>
            <p>The broadcaster has not enabled broadcast mode yet.</p>
          </section>
        ) : null}

        {isStandbyState ? (
          <section className="broadcast-standby" aria-live="polite">
            <div className="broadcast-standby-bars" aria-hidden="true" />
            <div className="broadcast-standby-loader">
              <span className="broadcast-standby-spinner" aria-hidden="true" />
              <p>Waiting for the broadcaster to start playback...</p>
            </div>
          </section>
        ) : null}

        {isLiveState ? (
          <section className="broadcast-live-player" aria-live="polite">
            <video
              ref={videoRef}
              className="broadcast-public-video"
              autoPlay
              playsInline
              preload="auto"
              controls
              controlsList="nodownload noplaybackrate"
              tabIndex={-1}
              onPause={handleVideoPause}
              onPlay={handleVideoPlay}
              onSeeking={handleVideoSeeking}
            >
              {effectiveStatus?.subtitleUrl ? (
                <track
                  key={effectiveStatus.subtitleUrl}
                  kind="subtitles"
                  src={absoluteApiUrl(effectiveStatus.subtitleUrl)}
                  srcLang="en"
                  label="Subtitles"
                  default
                />
              ) : null}
            </video>
          </section>
        ) : null}
      </section>
    </main>
  );
}
