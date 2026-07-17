import { useCallback, useEffect, useRef } from 'react';
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';
import type { PlaybackSource } from './usePlayerData';
import { clamp, describeMediaError } from './playerUtils';

// With on-demand HLS transcoding, independently produced MPEG-TS segments do not
// always tile the timeline perfectly (CFR frame-rounding + per-segment AAC
// priming leave sub-frame buffer holes). hls.js can resolve such a hole by
// jumping and emitting a premature `ended` event while real content remains.
// Treat an `ended` event as a genuine end only when playback is actually close
// to the media duration; otherwise nudge across the hole and keep playing.
const SPURIOUS_END_REMAINING_SECONDS = 3;
const SPURIOUS_END_NUDGE_SECONDS = 0.1;
const MAX_SPURIOUS_END_RECOVERIES = 3;

interface UsePlayerVideoPanelHandlersOptions {
  mediaId: string;
  /**
   * Authoritative runtime in seconds (source-probe duration the HLS manifest is
   * built from). Used to detect premature `ended` events because the <video>
   * element's own `duration` is unreliable at end-of-stream.
   */
  totalDuration: number;
  revealControls: () => void;
  seekTo: (seconds: number) => void;
  seekValue: number;
  setIsSeeking: Dispatch<SetStateAction<boolean>>;
  setSeekPreviewSeconds: Dispatch<SetStateAction<number | null>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setQualityMode: (value: 'auto' | number) => void;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsBuffering: Dispatch<SetStateAction<boolean>>;
  setIsControlsVisible: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  syncProgress: (completed?: boolean, keepalive?: boolean) => Promise<void>;
  switchingToHls: boolean;
  source: PlaybackSource | null;
  attemptedHlsFallbackRef: MutableRefObject<boolean>;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
  }) => Promise<boolean>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

interface PlayerVideoPanelHandlers {
  hideControls: () => void;
  clearSeekPreview: () => void;
  handleSeekTouchEnd: () => void;
  handlePlaybackRateChange: (nextRate: number) => void;
  handleQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  handleToggleTheaterMode: () => void;
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoEnded: () => boolean;
  handleVideoWaiting: () => void;
  handleVideoReady: () => void;
  handleVideoError: () => void;
}

export function usePlayerVideoPanelHandlers({
  mediaId,
  totalDuration,
  revealControls,
  seekTo,
  seekValue,
  setIsSeeking,
  setSeekPreviewSeconds,
  setPlaybackRate,
  setQualityMode,
  setTheaterMode,
  setIsPlaying,
  setIsBuffering,
  setIsControlsVisible,
  setPlayerError,
  syncProgress,
  switchingToHls,
  source,
  attemptedHlsFallbackRef,
  switchToHls,
  videoRef,
}: UsePlayerVideoPanelHandlersOptions): PlayerVideoPanelHandlers {
  const attemptedHlsRestartRef = useRef(false);
  const spuriousEndRecoveryRef = useRef({ attempts: 0, lastPositionSeconds: -1 });

  useEffect(() => {
    attemptedHlsRestartRef.current = false;
    spuriousEndRecoveryRef.current = { attempts: 0, lastPositionSeconds: -1 };
  }, [mediaId]);

  const hideControls = useCallback(() => {
    setIsControlsVisible(false);
  }, [setIsControlsVisible]);

  const clearSeekPreview = useCallback(() => {
    setSeekPreviewSeconds(null);
  }, [setSeekPreviewSeconds]);

  const handleSeekTouchEnd = useCallback(() => {
    setIsSeeking(false);
    seekTo(seekValue);
    void syncProgress(false);
  }, [seekTo, seekValue, setIsSeeking, syncProgress]);

  const handlePlaybackRateChange = useCallback(
    (nextRate: number) => {
      setPlaybackRate(clamp(nextRate, 0.5, 2));
      revealControls();
    },
    [revealControls, setPlaybackRate],
  );

  const handleQualityModeChange = useCallback(
    (nextQualityMode: 'auto' | number) => {
      setQualityMode(nextQualityMode);
      revealControls();
    },
    [revealControls, setQualityMode],
  );

  const handleToggleTheaterMode = useCallback(() => {
    setTheaterMode((previous) => !previous);
    revealControls();
  }, [revealControls, setTheaterMode]);

  const handleVideoPlay = useCallback(() => {
    setIsPlaying(true);
    setIsBuffering(false);
    revealControls();
  }, [revealControls, setIsBuffering, setIsPlaying]);

  const handleVideoPause = useCallback(() => {
    setIsPlaying(false);
    setIsBuffering(false);
    revealControls();
    void syncProgress(false);
  }, [revealControls, setIsBuffering, setIsPlaying, syncProgress]);

  const handleVideoEnded = useCallback((): boolean => {
    const video = videoRef.current;

    // Reject premature ends: if a meaningful amount of the video is still ahead,
    // this `ended` event came from a buffer hole rather than the real end of the
    // content. Nudge across the gap and resume instead of marking the item
    // complete / triggering auto-advance and losing the remainder.
    //
    // We deliberately measure "remaining" against the authoritative runtime
    // rather than `video.duration`. When the browser fires `ended` it snaps
    // `currentTime` to `duration`, and hls.js can additionally shrink `duration`
    // down to a truncated buffered edge on an early end-of-stream — so
    // `video.duration - video.currentTime` collapses to ~0 and would never
    // detect a premature end. `totalDuration` is the source-probe runtime the
    // manifest is built from and does not shrink, so it stays a valid reference.
    const authoritativeDurationSeconds = Math.max(
      totalDuration,
      Number.isFinite(video?.duration) ? video?.duration ?? 0 : 0,
    );

    if (video && authoritativeDurationSeconds > 0) {
      const remainingSeconds = authoritativeDurationSeconds - video.currentTime;

      if (remainingSeconds > SPURIOUS_END_REMAINING_SECONDS) {
        const recovery = spuriousEndRecoveryRef.current;
        const sameSpot =
          Math.abs(video.currentTime - recovery.lastPositionSeconds) < 1;
        recovery.attempts = sameSpot ? recovery.attempts + 1 : 1;
        recovery.lastPositionSeconds = video.currentTime;

        // Stop nudging once we keep landing in the same spot, but never fall
        // through to "completed" — staying paused mid-video is strictly better
        // than skipping the rest of it.
        if (recovery.attempts <= MAX_SPURIOUS_END_RECOVERIES) {
          try {
            video.currentTime = Math.min(
              authoritativeDurationSeconds,
              video.currentTime + SPURIOUS_END_NUDGE_SECONDS,
            );
          } catch {
            // Ignore seek failures; the play() below may still recover.
          }

          void video.play().catch(() => {
            // Resume can be rejected (e.g. autoplay policy); the user can
            // resume manually. We still avoid the false completion.
          });
        }

        return false;
      }
    }

    spuriousEndRecoveryRef.current = { attempts: 0, lastPositionSeconds: -1 };
    setIsPlaying(false);
    setIsControlsVisible(true);
    void syncProgress(true);
    return true;
  }, [setIsControlsVisible, setIsPlaying, syncProgress, totalDuration, videoRef]);

  const handleVideoWaiting = useCallback(() => {
    setIsBuffering(true);
  }, [setIsBuffering]);

  const handleVideoReady = useCallback(() => {
    setIsBuffering(false);
    setPlayerError(null);
  }, [setIsBuffering, setPlayerError]);

  const handleVideoError = useCallback(() => {
    const mediaErrorCode = videoRef.current?.error?.code;
    const mediaErrorText = describeMediaError(mediaErrorCode);

    if (switchingToHls) {
      setPlayerError(
        source?.hls
          ? 'Transcoded playback failed. Restarting stream session...'
          : 'Direct play failed. Starting transcoded stream...',
      );
      return;
    }

    if (source && !source.hls && !attemptedHlsFallbackRef.current) {
      attemptedHlsFallbackRef.current = true;
      setPlayerError(`Direct play failed (${mediaErrorText}). Switching to transcoded stream...`);

      void switchToHls().then((switched) => {
        if (!switched) {
          setPlayerError(
            `Direct play failed (${mediaErrorText}) and transcoded fallback could not start.`,
          );
        }
      });
      return;
    }

    if (source?.hls && !attemptedHlsRestartRef.current) {
      attemptedHlsRestartRef.current = true;
      setPlayerError(
        `Transcoded playback failed (${mediaErrorText}). Restarting stream session...`,
      );

      void switchToHls({ forceFresh: true }).then((switched) => {
        if (!switched) {
          setPlayerError(
            `Transcoded playback failed (${mediaErrorText}) and session restart could not start.`,
          );
        }
      });
      return;
    }

    setPlayerError(
      `Playback failed (${mediaErrorText}). Try another quality setting or reload the page.`,
    );
  }, [
    attemptedHlsFallbackRef,
    source,
    switchToHls,
    switchingToHls,
    videoRef,
    setPlayerError,
  ]);

  return {
    hideControls,
    clearSeekPreview,
    handleSeekTouchEnd,
    handlePlaybackRateChange,
    handleQualityModeChange,
    handleToggleTheaterMode,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEnded,
    handleVideoWaiting,
    handleVideoReady,
    handleVideoError,
  };
}
