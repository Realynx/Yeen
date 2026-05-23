import { useCallback, type RefObject } from 'react';
import type { SubtitleTrack } from '../../shared/services/types';
import type { PlaybackSource } from './usePlayerData';
import { clamp } from './playerUtils';

interface UsePlayerInteractionsArgs {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoShellRef: RefObject<HTMLDivElement | null>;
  totalDuration: number;
  currentTime: number;
  muted: boolean;
  volume: number;
  source: PlaybackSource | null;
  selectedSubtitle: SubtitleTrack | null;
  subtitleTracks: SubtitleTrack[];
  canUsePictureInPicture: boolean;
  revealControls: () => void;
  setSelectedSubtitleId: (id: string) => void;
  setSubtitleVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
  setPlaybackRate: React.Dispatch<React.SetStateAction<number>>;
  setCurrentTime: (value: number) => void;
  setSeekValue: (value: number) => void;
  setPlayerError: (value: string | null) => void;
  setIsPictureInPicture: (value: boolean) => void;
}

export interface PlayerInteractions {
  seekTo: (nextSeconds: number) => void;
  skipBy: (deltaSeconds: number) => void;
  applyVolume: (nextVolume: number) => void;
  togglePlay: () => Promise<void>;
  toggleMute: () => void;
  toggleSubtitleVisibility: () => void;
  toggleFullscreen: () => Promise<void>;
  togglePictureInPicture: () => Promise<void>;
  adjustPlaybackRate: (delta: number) => void;
}

export function usePlayerInteractions({
  videoRef,
  videoShellRef,
  totalDuration,
  currentTime,
  muted,
  volume,
  source,
  selectedSubtitle,
  subtitleTracks,
  canUsePictureInPicture,
  revealControls,
  setSelectedSubtitleId,
  setSubtitleVisible,
  setVolume,
  setMuted,
  setPlaybackRate,
  setCurrentTime,
  setSeekValue,
  setPlayerError,
  setIsPictureInPicture,
}: UsePlayerInteractionsArgs): PlayerInteractions {
  const seekTo = useCallback(
    (nextSeconds: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const maxDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
      const target = clamp(nextSeconds, 0, Math.max(maxDuration, 0));
      video.currentTime = target;
      setCurrentTime(target);
      setSeekValue(target);
      revealControls();
    },
    [revealControls, setCurrentTime, setSeekValue, totalDuration, videoRef],
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      const origin = video?.currentTime ?? currentTime;
      seekTo(origin + deltaSeconds);
    },
    [currentTime, seekTo, videoRef],
  );

  const applyVolume = useCallback(
    (nextVolume: number) => {
      const normalized = clamp(nextVolume, 0, 1);
      setVolume(normalized);
      setMuted(normalized === 0);
      revealControls();
    },
    [revealControls, setMuted, setVolume],
  );

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      if (video.paused || video.ended) {
        await video.play();
      } else {
        video.pause();
      }
      setPlayerError(null);
    } catch (playError) {
      if (playError instanceof DOMException && playError.name === 'AbortError') {
        return;
      }

      if (playError instanceof DOMException && playError.name === 'NotAllowedError') {
        setPlayerError('Playback start was blocked by browser policy. Click play again to continue.');
        return;
      }

      setPlayerError(
        source?.hls
          ? 'Playback could not start while the stream is recovering. Click play to retry.'
          : 'Playback could not start. Click play to retry.',
      );
    }
  }, [setPlayerError, source?.hls, videoRef]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    if (!nextMuted && volume <= 0.01) {
      setVolume(0.8);
    }
    setMuted(nextMuted);
    revealControls();
  }, [muted, revealControls, setMuted, setVolume, volume]);

  const toggleSubtitleVisibility = useCallback(() => {
    if (!selectedSubtitle?.url) {
      const fallbackTrack = subtitleTracks.find((track) => !!track.url);
      if (!fallbackTrack) {
        return;
      }

      setSelectedSubtitleId(fallbackTrack.id);
      setSubtitleVisible(true);
      revealControls();
      return;
    }

    setSubtitleVisible((previous) => !previous);
    revealControls();
  }, [revealControls, selectedSubtitle?.url, setSelectedSubtitleId, setSubtitleVisible, subtitleTracks]);

  const toggleFullscreen = useCallback(async () => {
    const shell = videoShellRef.current;
    if (!shell) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
      setPlayerError(null);
    } catch {
      setPlayerError('Fullscreen mode is unavailable in this browser.');
    }

    revealControls();
  }, [revealControls, setPlayerError, videoShellRef]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !canUsePictureInPicture) {
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPictureInPicture(false);
      } else {
        await video.requestPictureInPicture();
        setIsPictureInPicture(true);
      }
      setPlayerError(null);
    } catch {
      setPlayerError('Picture-in-picture mode is unavailable in this browser.');
    }

    revealControls();
  }, [canUsePictureInPicture, revealControls, setIsPictureInPicture, setPlayerError, videoRef]);

  const adjustPlaybackRate = useCallback(
    (delta: number) => {
      setPlaybackRate((previous) => clamp(previous + delta, 0.5, 2));
      revealControls();
    },
    [revealControls, setPlaybackRate],
  );

  return {
    seekTo,
    skipBy,
    applyVolume,
    togglePlay,
    toggleMute,
    toggleSubtitleVisibility,
    toggleFullscreen,
    togglePictureInPicture,
    adjustPlaybackRate,
  };
}
