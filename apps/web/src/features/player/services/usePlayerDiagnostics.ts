import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';
import { getHlsSessionStats } from '../../shared/services/api';
import type { HlsSessionStats } from '../../shared/services/types';
import type { PlaybackSource } from './usePlayerData';

const HLS_STATS_POLL_INTERVAL_MS = 2_000;

interface HlsStatsSnapshot {
  sessionId: string;
  stats: HlsSessionStats | null;
  error: string | null;
  updatedAt: string | null;
}

interface VideoTelemetrySnapshot {
  sourceUrl: string;
  telemetry: PlayerVideoTelemetry | null;
}

export interface PlayerVideoTelemetry {
  readyState: number;
  networkState: number;
  droppedVideoFrames: number | null;
  totalVideoFrames: number | null;
  bufferedAheadSeconds: number;
  bufferedEndSeconds: number;
  renderedWidth: number | null;
  renderedHeight: number | null;
}

interface UsePlayerDiagnosticsArgs {
  token: string;
  source: PlaybackSource | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface UsePlayerDiagnosticsState {
  showNerdStats: boolean;
  hlsSessionStats: HlsSessionStats | null;
  hlsSessionStatsError: string | null;
  hlsSessionStatsUpdatedAt: string | null;
  videoTelemetry: PlayerVideoTelemetry | null;
  toggleNerdStats: () => void;
}

function findBufferedEndSeconds(video: HTMLVideoElement): number {
  const position = video.currentTime;
  let bestEnd = 0;

  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);

    if (position >= start && position <= end) {
      return end;
    }

    if (end > bestEnd) {
      bestEnd = end;
    }
  }

  return bestEnd;
}

export function usePlayerDiagnostics({
  token,
  source,
  videoRef,
}: UsePlayerDiagnosticsArgs): UsePlayerDiagnosticsState {
  const [showNerdStats, setShowNerdStats] = useState(false);
  const [hlsStatsSnapshot, setHlsStatsSnapshot] = useState<HlsStatsSnapshot | null>(null);
  const [videoTelemetrySnapshot, setVideoTelemetrySnapshot] =
    useState<VideoTelemetrySnapshot | null>(null);

  const toggleNerdStats = useCallback(() => {
    setShowNerdStats((current) => !current);
  }, []);

  const activeHlsSessionId =
    showNerdStats && source?.hls && source.hlsSessionId ? source.hlsSessionId : null;

  useEffect(() => {
    if (!activeHlsSessionId) {
      return;
    }

    const sessionId = activeHlsSessionId;
    let cancelled = false;
    let inFlight = false;

    async function pollHlsStats() {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const stats = await getHlsSessionStats(token, sessionId);
        if (cancelled) {
          return;
        }

        setHlsStatsSnapshot({
          sessionId,
          stats,
          error: null,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (!cancelled) {
          setHlsStatsSnapshot({
            sessionId,
            stats: null,
            error: 'Unable to load transcoding diagnostics.',
            updatedAt: null,
          });
        }
      } finally {
        inFlight = false;
      }
    }

    void pollHlsStats();
    const intervalId = window.setInterval(() => {
      void pollHlsStats();
    }, HLS_STATS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeHlsSessionId, token]);

  const activeSourceUrl = showNerdStats ? source?.url ?? null : null;

  useEffect(() => {
    if (!activeSourceUrl) {
      return;
    }

    const sourceUrl = activeSourceUrl;
    let cancelled = false;

    function sampleVideoTelemetry() {
      if (cancelled) {
        return;
      }

      const video = videoRef.current;
      if (!video) {
        setVideoTelemetrySnapshot({ sourceUrl, telemetry: null });
        return;
      }

      const playbackQuality =
        typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality()
          : null;
      const bufferedEndSeconds = findBufferedEndSeconds(video);

      setVideoTelemetrySnapshot({
        sourceUrl,
        telemetry: {
          readyState: video.readyState,
          networkState: video.networkState,
          droppedVideoFrames: playbackQuality?.droppedVideoFrames ?? null,
          totalVideoFrames: playbackQuality?.totalVideoFrames ?? null,
          bufferedAheadSeconds: Math.max(0, bufferedEndSeconds - video.currentTime),
          bufferedEndSeconds,
          renderedWidth: video.videoWidth > 0 ? video.videoWidth : null,
          renderedHeight: video.videoHeight > 0 ? video.videoHeight : null,
        },
      });
    }

    sampleVideoTelemetry();
    const intervalId = window.setInterval(sampleVideoTelemetry, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSourceUrl, videoRef]);

  const hlsSessionStats = useMemo(() => {
    if (!activeHlsSessionId || !hlsStatsSnapshot || hlsStatsSnapshot.sessionId !== activeHlsSessionId) {
      return null;
    }

    return hlsStatsSnapshot.stats;
  }, [activeHlsSessionId, hlsStatsSnapshot]);

  const hlsSessionStatsError = useMemo(() => {
    if (!activeHlsSessionId || !hlsStatsSnapshot || hlsStatsSnapshot.sessionId !== activeHlsSessionId) {
      return null;
    }

    return hlsStatsSnapshot.error;
  }, [activeHlsSessionId, hlsStatsSnapshot]);

  const hlsSessionStatsUpdatedAt = useMemo(() => {
    if (!activeHlsSessionId || !hlsStatsSnapshot || hlsStatsSnapshot.sessionId !== activeHlsSessionId) {
      return null;
    }

    return hlsStatsSnapshot.updatedAt;
  }, [activeHlsSessionId, hlsStatsSnapshot]);

  const videoTelemetry = useMemo(() => {
    if (!activeSourceUrl || !videoTelemetrySnapshot || videoTelemetrySnapshot.sourceUrl !== activeSourceUrl) {
      return null;
    }

    return videoTelemetrySnapshot.telemetry;
  }, [activeSourceUrl, videoTelemetrySnapshot]);

  return {
    showNerdStats,
    hlsSessionStats,
    hlsSessionStatsError,
    hlsSessionStatsUpdatedAt,
    videoTelemetry,
    toggleNerdStats,
  };
}
