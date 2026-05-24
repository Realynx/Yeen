import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  absoluteApiUrl,
  getPublicBroadcastSession,
  heartbeatPublicBroadcastViewer,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';
import './public-broadcast-page.css';

const STATUS_POLL_INTERVAL_MS = 1800;
const HEARTBEAT_INTERVAL_MS = 15000;
const PLAYBACK_SYNC_INTERVAL_MS = 650;
const HARD_SYNC_DRIFT_SECONDS = 1.1;
const EXTREME_SYNC_DRIFT_SECONDS = 4.5;
const SOFT_SYNC_DRIFT_SECONDS = 0.28;
const SOFT_SYNC_RATE_LIMIT = 0.03;
const LIVE_STATE_GRACE_MS = 8000;
const MAX_PREDICTED_LEAD_SECONDS = 1.5;
const HARD_SYNC_COOLDOWN_MS = 2800;
const MANIFEST_SETTLE_MS = 2200;
const SEEK_GUARD_WINDOW_MS = 1200;

interface PlaybackSyncRuntime {
  lastManifestUrl: string | null;
  lastManifestAppliedAtMs: number;
  lastHardSyncAtMs: number;
}

function resolveBroadcastTargetPosition(status: BroadcastPublicSession): number {
  const basePosition = Math.max(0, status.playbackPositionSeconds);

  if (!status.playbackIsPlaying) {
    return basePosition;
  }

  const playbackUpdatedAtMs = Date.parse(status.playbackUpdatedAt ?? '');
  if (!Number.isFinite(playbackUpdatedAtMs)) {
    return basePosition;
  }

  const elapsedSeconds = Math.max(0, (Date.now() - playbackUpdatedAtMs) / 1000);
  return basePosition + Math.min(elapsedSeconds, MAX_PREDICTED_LEAD_SECONDS);
}

interface PublicBroadcastPageProps {
  shareToken?: string;
}

function resolveEffectiveBroadcastStatus(
  status: BroadcastPublicSession | null,
  lastLiveStatus: BroadcastPublicSession | null,
  lastLiveAtMs: number,
): BroadcastPublicSession | null {
  if (status?.isLive && status.manifestUrl) {
    return status;
  }

  if (!lastLiveStatus) {
    return status;
  }

  const withinGraceWindow = Date.now() - lastLiveAtMs <= LIVE_STATE_GRACE_MS;
  if (!withinGraceWindow) {
    return status;
  }

  if (status?.enabled === false) {
    return status;
  }

  if (
    status?.mediaId
    && lastLiveStatus.mediaId
    && status.mediaId !== lastLiveStatus.mediaId
  ) {
    return status;
  }

  if (!status) {
    return lastLiveStatus;
  }

  return {
    ...lastLiveStatus,
    enabled: status.enabled,
    viewerCount: status.viewerCount,
    shareToken: status.shareToken,
    mediaId: status.mediaId ?? lastLiveStatus.mediaId,
    subtitleUrl: status.subtitleUrl ?? lastLiveStatus.subtitleUrl,
  };
}

function syncVideoToBroadcastStatus(
  video: HTMLVideoElement,
  status: BroadcastPublicSession,
  syncRuntimeRef: { current: PlaybackSyncRuntime },
  suppressSeekGuardUntilRef: { current: number },
): void {
  const nowMs = Date.now();

  if (!status.isLive || !status.manifestUrl) {
    if (!video.paused) {
      video.pause();
    }

    if (video.playbackRate !== 1) {
      video.playbackRate = 1;
    }

    return;
  }

  const nextManifestUrl = absoluteApiUrl(status.manifestUrl);
  if (video.src !== nextManifestUrl) {
    video.src = nextManifestUrl;
    video.load();
    syncRuntimeRef.current.lastManifestUrl = nextManifestUrl;
    syncRuntimeRef.current.lastManifestAppliedAtMs = nowMs;
    syncRuntimeRef.current.lastHardSyncAtMs = 0;
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    return;
  }

  if (video.readyState < 1) {
    return;
  }

  if (video.seeking && nowMs < suppressSeekGuardUntilRef.current) {
    return;
  }

  const targetPosition = resolveBroadcastTargetPosition(status);
  const currentPosition = Number.isFinite(video.currentTime)
    ? video.currentTime
    : 0;
  const drift = targetPosition - currentPosition;
  const absoluteDrift = Math.abs(drift);

  const inManifestSettleWindow =
    nowMs - syncRuntimeRef.current.lastManifestAppliedAtMs < MANIFEST_SETTLE_MS;

  const canHardSync =
    absoluteDrift > EXTREME_SYNC_DRIFT_SECONDS
    || nowMs - syncRuntimeRef.current.lastHardSyncAtMs >= HARD_SYNC_COOLDOWN_MS;

  if (!inManifestSettleWindow && absoluteDrift > HARD_SYNC_DRIFT_SECONDS && canHardSync) {
    suppressSeekGuardUntilRef.current = nowMs + SEEK_GUARD_WINDOW_MS;
    syncRuntimeRef.current.lastHardSyncAtMs = nowMs;
    video.currentTime = targetPosition;
    video.playbackRate = 1;
  } else if (
    status.playbackIsPlaying
    && absoluteDrift > SOFT_SYNC_DRIFT_SECONDS
    && !inManifestSettleWindow
  ) {
    const adjustment = Math.max(
      -SOFT_SYNC_RATE_LIMIT,
      Math.min(SOFT_SYNC_RATE_LIMIT, drift * 0.08),
    );
    video.playbackRate = 1 + adjustment;
  } else if (video.playbackRate !== 1) {
    video.playbackRate = 1;
  }

  if (status.playbackIsPlaying) {
    if (video.paused) {
      void video.play().catch(() => {
        // Native controls still allow the viewer to start playback manually.
      });
    }
  } else if (!video.paused) {
    video.pause();
  }
}

export function PublicBroadcastPage({ shareToken }: PublicBroadcastPageProps) {
  const resolvedShareToken = shareToken?.trim() || '';

  const [status, setStatus] = useState<BroadcastPublicSession | null>(null);
  const [loading, setLoading] = useState(Boolean(resolvedShareToken));
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const statusRef = useRef<BroadcastPublicSession | null>(null);
  const suppressSeekGuardUntilRef = useRef(0);
  const syncRuntimeRef = useRef<PlaybackSyncRuntime>({
    lastManifestUrl: null,
    lastManifestAppliedAtMs: 0,
    lastHardSyncAtMs: 0,
  });
  const lastLiveAtRef = useRef(0);
  const lastLiveStatusRef = useRef<BroadcastPublicSession | null>(null);

  const effectiveStatus = useMemo(() => {
    return resolveEffectiveBroadcastStatus(
      status,
      lastLiveStatusRef.current,
      lastLiveAtRef.current,
    );
  }, [status]);

  useEffect(() => {
    if (status?.isLive && status.manifestUrl) {
      lastLiveAtRef.current = Date.now();
      lastLiveStatusRef.current = status;
    }
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
