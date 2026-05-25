import { useCallback, useEffect, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { upsertProgress } from '../../shared/services/api';
import type {
  SubtitleTrack,
} from '../../shared/services/types';
import type { PlaybackSource } from './usePlayerData';
import type { SubtitleFontPreset } from './playerUtils';
import { usePlayerCasting } from './usePlayerCasting';
import { usePlayerControlsTimer } from './usePlayerControlsTimer';
import { usePlayerInteractions } from './usePlayerInteractions';
import { usePlayerKeyboardShortcuts } from './usePlayerKeyboardShortcuts';
import { usePlayerPageEffects } from './usePlayerPageEffects';
import { usePlayerTimelineHandlers } from './usePlayerTimelineHandlers';
import { usePlayerVideoPanelHandlers } from './usePlayerVideoPanelHandlers';

interface UsePlayerPlaybackRuntimeOptions {
  token: string;
  mediaId: string;
  hideTopNav: boolean;
  playerTitle: string;
  source: PlaybackSource | null;
  switchingToHls: boolean;
  selectedSubtitle: SubtitleTrack | null;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleUrl: string | null;
  requestedStartSeconds: number;
  resumeAtSeconds: number;
  totalDuration: number;
  currentTime: number;
  seekValue: number;
  isPlaying: boolean;
  isSeeking: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  theaterMode: boolean;
  subtitleFontPreset: SubtitleFontPreset;
  preferredVideoBitrateKbps: number | null;
  preferredAudioBitrateKbps: number | null;
  preferredMaxResolutionHeight: number | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoShellRef: RefObject<HTMLDivElement | null>;
  hasAppliedInitialSeekRef: RefObject<boolean>;
  progressSyncTimestampRef: RefObject<number>;
  attemptedHlsFallbackRef: RefObject<boolean>;
  setSelectedSubtitleId: (subtitleId: string) => void;
  setSubtitleVisible: Dispatch<SetStateAction<boolean>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setMuted: Dispatch<SetStateAction<boolean>>;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setSeekValue: Dispatch<SetStateAction<number>>;
  setSeekPreviewSeconds: Dispatch<SetStateAction<number | null>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setBufferedPercent: Dispatch<SetStateAction<number>>;
  setIsSeeking: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setIsBuffering: Dispatch<SetStateAction<boolean>>;
  setIsControlsVisible: Dispatch<SetStateAction<boolean>>;
  setIsPictureInPicture: Dispatch<SetStateAction<boolean>>;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  setPlayerError: Dispatch<SetStateAction<string | null>>;
  setQualityMode: Dispatch<SetStateAction<'auto' | number>>;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => Promise<boolean>;
  withAutoAdvance: (handler: () => void) => () => void;
}

export interface PlayerPlaybackRuntime {
  canUsePictureInPicture: boolean;
  canCast: boolean;
  castDeviceAvailable: boolean;
  isCasting: boolean;
  openCastPicker: () => Promise<void>;
  seekTo: (seconds: number) => void;
  skipBy: (deltaSeconds: number) => void;
  applyVolume: (nextVolume: number) => void;
  revealControls: () => void;
  togglePlay: () => Promise<void>;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  togglePictureInPicture: () => Promise<void>;
  hideControls: () => void;
  clearSeekPreview: () => void;
  handleSeekTouchEnd: () => void;
  handlePlaybackRateChange: (nextRate: number) => void;
  handleQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  handleToggleTheaterMode: () => void;
  handleTimeUpdate: () => void;
  handleBufferedProgress: () => void;
  handleDurationChange: () => void;
  handleLoadedMetadata: () => void;
  handleSeekInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekPointerDown: () => void;
  handleSeekPointerUp: (event: React.MouseEvent<HTMLInputElement>) => void;
  handleSeekPreview: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoEndedWithAutoNext: () => void;
  handleVideoWaiting: () => void;
  handleVideoReady: () => void;
  handleVideoError: () => void;
}

export function usePlayerPlaybackRuntime({
  token,
  mediaId,
  hideTopNav,
  playerTitle,
  source,
  switchingToHls,
  selectedSubtitle,
  subtitleTracks,
  activeSubtitleUrl,
  requestedStartSeconds,
  resumeAtSeconds,
  totalDuration,
  currentTime,
  seekValue,
  isPlaying,
  isSeeking,
  muted,
  volume,
  playbackRate,
  theaterMode,
  subtitleFontPreset,
  preferredVideoBitrateKbps,
  preferredAudioBitrateKbps,
  preferredMaxResolutionHeight,
  videoRef,
  videoShellRef,
  hasAppliedInitialSeekRef,
  progressSyncTimestampRef,
  attemptedHlsFallbackRef,
  setSelectedSubtitleId,
  setSubtitleVisible,
  setVolume,
  setMuted,
  setPlaybackRate,
  setCurrentTime,
  setSeekValue,
  setSeekPreviewSeconds,
  setDuration,
  setBufferedPercent,
  setIsSeeking,
  setIsPlaying,
  setIsBuffering,
  setIsControlsVisible,
  setIsPictureInPicture,
  setIsFullscreen,
  setPlayerError,
  setQualityMode,
  setTheaterMode,
  switchToHls,
  withAutoAdvance,
}: UsePlayerPlaybackRuntimeOptions): PlayerPlaybackRuntime {
  const canUsePictureInPicture = useMemo(() => Boolean(document.pictureInPictureEnabled), []);

  const {
    canCast,
    castDeviceAvailable,
    isCasting,
    openCastPicker,
  } = usePlayerCasting({
    videoRef,
    sourceUrl: source?.url ?? null,
    sourceIsHls: Boolean(source?.hls),
    mediaTitle: playerTitle,
    setPlayerError,
  });

  const { clearControlsTimer, scheduleControlsAutoHide, revealControls } =
    usePlayerControlsTimer({ isPlaying, isSeeking, setIsControlsVisible });

  const syncProgress = useCallback(
    async (completed = false, keepalive = false) => {
      const video = videoRef.current;
      if (!video || !mediaId) {
        return;
      }

      const safeVideoDuration = Number.isFinite(video.duration) ? video.duration : totalDuration;
      const positionSeconds = Math.max(0, Math.floor(video.currentTime || 0));
      const durationSeconds = Math.max(0, Math.floor(safeVideoDuration || 0));

      // During episode/source transitions the video element can be briefly reset
      // (currentTime=0, src detached). Skipping those writes prevents overwriting
      // a previously saved non-zero position with a transient zero.
      if (!completed && positionSeconds <= 0) {
        return;
      }

      const syncTimestampMs = Math.max(
        Date.now(),
        (progressSyncTimestampRef.current ?? 0) + 1,
      );
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(
          token,
          mediaId,
          {
            positionSeconds,
            durationSeconds,
            syncTimestampMs,
            completed,
          },
          { keepalive },
        );
      } catch {
        // Keep playback uninterrupted if progress persistence fails.
      }
    },
    [mediaId, progressSyncTimestampRef, token, totalDuration, videoRef],
  );

  const {
    seekTo,
    skipBy,
    applyVolume,
    togglePlay,
    toggleMute,
    toggleSubtitleVisibility,
    toggleFullscreen,
    togglePictureInPicture,
    adjustPlaybackRate,
  } = usePlayerInteractions({
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
  });

  usePlayerKeyboardShortcuts({
    enabled: !hideTopNav,
    applyVolume,
    revealControls,
    skipBy,
    toggleFullscreen,
    toggleMute,
    togglePictureInPicture,
    togglePlay,
    toggleSubtitleVisibility,
    adjustPlaybackRate,
    volume,
  });

  usePlayerPageEffects({
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
    sourceUrl: source?.url ?? null,
    activeSubtitleUrl,
    setIsFullscreen,
    setIsPictureInPicture,
    syncProgress,
  });

  useEffect(() => {
    hasAppliedInitialSeekRef.current = false;
  }, [hasAppliedInitialSeekRef, mediaId, requestedStartSeconds, source?.url]);

  const {
    handleTimeUpdate,
    handleBufferedProgress,
    handleDurationChange,
    handleLoadedMetadata,
    handleSeekInputChange,
    handleSeekPointerDown,
    handleSeekPointerUp,
    handleSeekPreview,
  } = usePlayerTimelineHandlers({
    videoRef,
    totalDuration,
    requestedStartSeconds,
    resumeAtSeconds,
    isSeeking,
    hasAppliedInitialSeekRef,
    setCurrentTime,
    setSeekValue,
    setBufferedPercent,
    setDuration,
    setIsBuffering,
    setIsSeeking,
    setSeekPreviewSeconds,
    seekTo,
    revealControls,
    syncProgress,
  });

  const {
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
  } = usePlayerVideoPanelHandlers({
    mediaId,
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
  });

  const handleVideoEndedWithAutoNext = useMemo(
    () => withAutoAdvance(handleVideoEnded),
    [handleVideoEnded, withAutoAdvance],
  );

  return {
    canUsePictureInPicture,
    canCast,
    castDeviceAvailable,
    isCasting,
    openCastPicker,
    seekTo,
    skipBy,
    applyVolume,
    revealControls,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    togglePictureInPicture,
    hideControls,
    clearSeekPreview,
    handleSeekTouchEnd,
    handlePlaybackRateChange,
    handleQualityModeChange,
    handleToggleTheaterMode,
    handleTimeUpdate,
    handleBufferedProgress,
    handleDurationChange,
    handleLoadedMetadata,
    handleSeekInputChange,
    handleSeekPointerDown,
    handleSeekPointerUp,
    handleSeekPreview,
    handleVideoPlay,
    handleVideoPause,
    handleVideoEndedWithAutoNext,
    handleVideoWaiting,
    handleVideoReady,
    handleVideoError,
  };
}
