import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import {
  PLAYER_PREFERENCES_KEY,
  type PlayerPreferences,
} from './playerUtils';
import { setupSubtitleTrackSync } from './subtitleTrackSync';

interface UsePlayerPageEffectsOptions {
  clearControlsTimer: () => void;
  isPlaying: boolean;
  isSeeking: boolean;
  scheduleControlsAutoHide: () => void;
  volume: number;
  muted: boolean;
  playbackRate: number;
  theaterMode: boolean;
  subtitleFontPreset: PlayerPreferences['subtitleFontPreset'];
  preferredVideoBitrateKbps: PlayerPreferences['preferredVideoBitrateKbps'];
  preferredAudioBitrateKbps: PlayerPreferences['preferredAudioBitrateKbps'];
  preferredMaxResolutionHeight: PlayerPreferences['preferredMaxResolutionHeight'];
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  sourceUrl: string | null;
  activeSubtitleUrl: string | null;
  setIsFullscreen: (value: boolean) => void;
  setIsPictureInPicture: (value: boolean) => void;
  syncProgress: (completed?: boolean, keepalive?: boolean) => Promise<void>;
}

const PROGRESS_SYNC_INTERVAL_MS = 5000;

export function usePlayerPageEffects({
  clearControlsTimer,
  isPlaying,
  isSeeking,
  scheduleControlsAutoHide,
  volume,
  muted,
  playbackRate,
  theaterMode,
  subtitleFontPreset,
  preferredVideoBitrateKbps,
  preferredAudioBitrateKbps,
  preferredMaxResolutionHeight,
  videoRef,
  sourceUrl,
  activeSubtitleUrl,
  setIsFullscreen,
  setIsPictureInPicture,
  syncProgress,
}: UsePlayerPageEffectsOptions): void {
  useEffect(() => {
    if (!isPlaying || isSeeking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncProgress(false);
    }, PROGRESS_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, isSeeking, syncProgress]);

  useEffect(() => {
    clearControlsTimer();

    if (isPlaying && !isSeeking) {
      scheduleControlsAutoHide();
    }
  }, [clearControlsTimer, isPlaying, isSeeking, scheduleControlsAutoHide]);

  useEffect(() => {
    return () => {
      clearControlsTimer();
    };
  }, [clearControlsTimer]);

  useEffect(() => {
    try {
      const payload: PlayerPreferences = {
        volume,
        muted,
        playbackRate,
        theaterMode,
        subtitleFontPreset,
        preferredVideoBitrateKbps,
        preferredAudioBitrateKbps,
        preferredMaxResolutionHeight,
      };

      window.localStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage persistence errors.
    }
  }, [
    muted,
    playbackRate,
    preferredAudioBitrateKbps,
    preferredMaxResolutionHeight,
    preferredVideoBitrateKbps,
    subtitleFontPreset,
    theaterMode,
    volume,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.muted = muted;
    video.playbackRate = playbackRate;
  }, [muted, playbackRate, videoRef, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    return setupSubtitleTrackSync(video, activeSubtitleUrl);
  }, [activeSubtitleUrl, sourceUrl, videoRef]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handlePiPChange = () => {
      setIsPictureInPicture(Boolean(document.pictureInPictureElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('enterpictureinpicture', handlePiPChange);
    document.addEventListener('leavepictureinpicture', handlePiPChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('enterpictureinpicture', handlePiPChange);
      document.removeEventListener('leavepictureinpicture', handlePiPChange);
    };
  }, [setIsFullscreen, setIsPictureInPicture]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }

      void syncProgress(false, true);
    };

    const handlePageHide = () => {
      void syncProgress(false, true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [syncProgress]);

  useEffect(() => {
    return () => {
      void syncProgress(false, true);
    };
  }, [syncProgress]);
}
