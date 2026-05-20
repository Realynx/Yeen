import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import {
  PLAYER_PREFERENCES_KEY,
  type PlayerPreferences,
} from './playerUtils';

interface UsePlayerPageEffectsOptions {
  clearControlsTimer: () => void;
  isPlaying: boolean;
  isSeeking: boolean;
  scheduleControlsAutoHide: () => void;
  volume: number;
  muted: boolean;
  playbackRate: number;
  theaterMode: boolean;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  activeSubtitleUrl: string | null;
  setIsFullscreen: (value: boolean) => void;
  setIsPictureInPicture: (value: boolean) => void;
  syncProgress: (completed?: boolean) => Promise<void>;
}

export function usePlayerPageEffects({
  clearControlsTimer,
  isPlaying,
  isSeeking,
  scheduleControlsAutoHide,
  volume,
  muted,
  playbackRate,
  theaterMode,
  videoRef,
  activeSubtitleUrl,
  setIsFullscreen,
  setIsPictureInPicture,
  syncProgress,
}: UsePlayerPageEffectsOptions): void {
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
      };

      window.localStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage persistence errors.
    }
  }, [muted, playbackRate, theaterMode, volume]);

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

    const normalizeUrl = (value: string) => {
      try {
        return new URL(value, window.location.href).toString();
      } catch {
        return value;
      }
    };

    const syncSubtitleTracks = () => {
      const subtitleTextTracks: TextTrack[] = [];

      for (let index = 0; index < video.textTracks.length; index += 1) {
        const textTrack = video.textTracks[index];
        if (textTrack.kind === 'subtitles' || textTrack.kind === 'captions') {
          subtitleTextTracks.push(textTrack);
        }
      }

      for (const textTrack of subtitleTextTracks) {
        textTrack.mode = 'disabled';
      }

      if (!activeSubtitleUrl) {
        return;
      }

      const normalizedActiveUrl = normalizeUrl(activeSubtitleUrl);
      const trackElements = Array.from(video.querySelectorAll('track'));

      for (const trackElement of trackElements) {
        const src = trackElement.getAttribute('src');
        if (!src) {
          continue;
        }

        if (normalizeUrl(src) === normalizedActiveUrl) {
          trackElement.track.mode = 'showing';
          return;
        }
      }

      if (subtitleTextTracks.length > 0) {
        subtitleTextTracks[0].mode = 'showing';
      }
    };

    const handleTrackMutation = () => {
      syncSubtitleTracks();
    };

    syncSubtitleTracks();
    video.textTracks.addEventListener('addtrack', handleTrackMutation);
    video.textTracks.addEventListener('removetrack', handleTrackMutation);
    video.addEventListener('loadedmetadata', handleTrackMutation);

    return () => {
      video.textTracks.removeEventListener('addtrack', handleTrackMutation);
      video.textTracks.removeEventListener('removetrack', handleTrackMutation);
      video.removeEventListener('loadedmetadata', handleTrackMutation);
    };
  }, [activeSubtitleUrl, videoRef]);

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
    const handlePageHide = () => {
      void syncProgress(false);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [syncProgress]);

  useEffect(() => {
    return () => {
      void syncProgress(false);
    };
  }, [syncProgress]);
}
