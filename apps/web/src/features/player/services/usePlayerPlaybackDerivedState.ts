import { useMemo } from 'react';
import type { MediaItem, SubtitleTrack } from '../../shared/services/types';
import { clamp } from './playerUtils';

interface UsePlayerPlaybackDerivedStateOptions {
  searchParams: URLSearchParams;
  duration: number;
  media: MediaItem | null;
  currentTime: number;
  subtitleVisible: boolean;
  selectedSubtitle: SubtitleTrack | null;
}

interface PlayerPlaybackDerivedState {
  requestedStartSeconds: number;
  totalDuration: number;
  safeDuration: number;
  playedPercent: number;
  activeSubtitle: SubtitleTrack | null;
  playerTitle: string;
}

export function usePlayerPlaybackDerivedState({
  searchParams,
  duration,
  media,
  currentTime,
  subtitleVisible,
  selectedSubtitle,
}: UsePlayerPlaybackDerivedStateOptions): PlayerPlaybackDerivedState {
  const requestedStartSeconds = useMemo(() => {
    const raw = searchParams.get('t');
    if (!raw) {
      return 0;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return parsed;
  }, [searchParams]);

  const totalDuration = useMemo(() => {
    // `duration` mirrors the <video> element's duration, which hls.js can shrink
    // to a truncated buffered edge when a sub-frame segment hole trips an early
    // end-of-stream. The source-probe `durationSeconds` is what the HLS manifest
    // is actually built from, so it is the authoritative runtime — never report a
    // total shorter than it, otherwise the scrubber and end-of-video detection
    // would treat a cut-short runtime as the whole movie.
    const probeDurationSeconds = Math.max(media?.durationSeconds ?? 0, 0);

    if (duration > 0) {
      return Math.max(duration, probeDurationSeconds);
    }

    return probeDurationSeconds;
  }, [duration, media?.durationSeconds]);

  const safeDuration = Math.max(totalDuration, 1);
  const playedPercent = clamp((currentTime / safeDuration) * 100, 0, 100);

  const activeSubtitle = subtitleVisible && selectedSubtitle?.url
    ? selectedSubtitle
    : null;

  const playerTitle =
    media?.type === 'show' && media.episodeTitle?.trim()
      ? media.episodeTitle.trim()
      : media?.title ?? 'Player';

  return {
    requestedStartSeconds,
    totalDuration,
    safeDuration,
    playedPercent,
    activeSubtitle,
    playerTitle,
  };
}
