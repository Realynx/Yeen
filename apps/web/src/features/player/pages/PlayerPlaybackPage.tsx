import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PlayerPlaybackPageView } from "../components/PlayerPlaybackPageView";
import type { User } from "../../shared/services/types";
import { usePlayerData } from "../services/usePlayerData";
import { usePlayerMediaSource } from "../services/usePlayerMediaSource";
import { usePlayerDiagnostics } from "../services/usePlayerDiagnostics";
import { useShowEpisodes } from "../services/useShowEpisodes";
import { usePlayerPreferenceState } from "../services/usePlayerPreferenceState";
import { usePlayerSeriesPlaybackPreferences } from "../services/usePlayerSeriesPlaybackPreferences";
import { usePlayerPlaybackRuntime } from "../services/usePlayerPlaybackRuntime";
import { usePlayerTopBarActions } from "../services/usePlayerTopBarActions";
import { usePlayerScrubbingClass } from "../services/usePlayerScrubbingClass";
import { usePlayerQualityPreferences } from "../services/usePlayerQualityPreferences";
import { redactAccessToken } from "../services/playerPageUtils";
import { usePlayerPlaybackViewState } from "../services/usePlayerPlaybackViewState";
import { useBroadcast } from "../../broadcast/services/broadcast-context";
import { usePlayerBroadcastSync } from "../services/usePlayerBroadcastSync";
import { usePlayerPlaybackDerivedState } from "../services/usePlayerPlaybackDerivedState";
import { usePlayerTrackCycleShortcuts } from "../services/usePlayerTrackCycleShortcuts";

interface PlayerPlaybackPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
  isTvMode?: boolean;
}

function useSubtitleVisibility(
  mediaId: string,
  selectedSubtitleId: string,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const selectionKey = `${mediaId}:${selectedSubtitleId}`;
  const defaultVisible = selectedSubtitleId !== "";
  const [visibility, setVisibility] = useState({
    selectionKey,
    visible: defaultVisible,
  });
  const visible =
    visibility.selectionKey === selectionKey
      ? visibility.visible
      : defaultVisible;
  const setVisible = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      setVisibility((previous) => {
        const current =
          previous.selectionKey === selectionKey
            ? previous.visible
            : defaultVisible;
        return {
          selectionKey,
          visible: typeof next === "function" ? next(current) : next,
        };
      });
    },
    [defaultVisible, selectionKey],
  );
  return [visible, setVisible];
}

export function PlayerPlaybackPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
  isTvMode = false,
}: PlayerPlaybackPageProps) {
  const { mediaId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    isEnabled: broadcastEnabled,
    updateSource: updateBroadcastSource,
    updatePlayback: updateBroadcastPlayback,
    viewers: broadcastViewers,
  } = useBroadcast();

  const {
    query,
    setQuery,
    handleSearch,
    handleBackNavigation,
    openRandomDetails,
    openCurrentDetails,
  } = usePlayerTopBarActions({ token, mediaId, navigate });

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [mediaId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoShellRef = useRef<HTMLDivElement>(null);
  const progressSyncTimestampRef = useRef(0);
  const hasAppliedInitialSeekRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(
    null,
  );
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [subtitleTrackRevision, setSubtitleTrackRevision] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const {
    theaterMode,
    setTheaterMode,
    volume,
    setVolume,
    muted,
    setMuted,
    playbackRate,
    setPlaybackRate,
    subtitleFontPreset,
    setSubtitleFontPreset,
    preferredVideoBitrateKbps,
    setPreferredVideoBitrateKbps,
    preferredAudioBitrateKbps,
    setPreferredAudioBitrateKbps,
    preferredMaxResolutionHeight,
    setPreferredMaxResolutionHeight,
    accountVideoQuotaKbps,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    maxResolutionForBitrateBudget,
    effectivePreferredMaxResolutionHeight,
    transcodePreferences,
  } = usePlayerPreferenceState({ userMaxBitrateKbps: user.maxBitrateKbps });

  const {
    media,
    source,
    playbackPlan,
    audioTracks,
    selectedAudioStreamIndex,
    subtitleTracks,
    selectedSubtitleId,
    selectedSubtitle,
    resumeAtSeconds,
    loading,
    error,
    switchingToHls,
    extractingSubtitleTrackId,
    setSelectedAudioStreamIndex,
    setSelectedSubtitleId,
    extractTrack,
    switchToHls,
  } = usePlayerData(token, mediaId, transcodePreferences);

  const [subtitleVisible, setSubtitleVisible] = useSubtitleVisibility(
    mediaId,
    selectedSubtitleId,
  );

  const {
    showNerdStats,
    hlsSessionStats,
    hlsSessionStatsError,
    hlsSessionStatsUpdatedAt,
    videoTelemetry,
    toggleNerdStats,
  } = usePlayerDiagnostics({ token, source, videoRef });

  usePlayerScrubbingClass(isSeeking);

  const {
    requestedStartSeconds,
    totalDuration,
    safeDuration,
    playedPercent,
    activeSubtitle,
    playerTitle,
  } = usePlayerPlaybackDerivedState({
    searchParams,
    duration,
    media,
    currentTime,
    subtitleVisible,
    selectedSubtitle,
  });

  const addonPreparation = useMemo(
    () => ({
      playbackPlan,
      media,
      source,
      loading,
      switchingToHls,
    }),
    [loading, media, playbackPlan, source, switchingToHls],
  );

  const {
    previousEpisode,
    nextEpisode,
    previousEpisodeImage,
    nextEpisodeImage,
    autoAdvanceSeconds,
    cancelAutoAdvance,
    withAutoAdvance,
  } = useShowEpisodes(token, media, mediaId);

  // Must be memoized — `usePlayerMediaSource` lists this in its effect deps.
  // A fresh function literal on every render would re-run the effect, which
  // destroys/recreates the Hls instance and resets currentTime to 0 (making
  // playback never start and the scrubber snap back to zero on every event).
  const restartHlsSession = useCallback(
    () =>
      switchToHls({
        forceFresh: true,
        recoveryAttempt: true,
        audioStreamIndex: selectedAudioStreamIndex,
        maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
        audioBitrateKbps: effectivePreferredAudioBitrateKbps,
        maxOutputHeight: effectivePreferredMaxResolutionHeight,
      }),
    [
      effectivePreferredAudioBitrateKbps,
      effectivePreferredMaxResolutionHeight,
      effectivePreferredVideoBitrateKbps,
      selectedAudioStreamIndex,
      switchToHls,
    ],
  );

  const {
    persistSeriesPlaybackPreference,
    handleSelectAudioTrack,
    handleSelectSubtitle,
  } = usePlayerSeriesPlaybackPreferences({
    token,
    mediaId,
    media,
    currentTime,
    totalDuration,
    videoRef,
    progressSyncTimestampRef,
    audioTracks,
    selectedAudioStreamIndex,
    setSelectedAudioStreamIndex,
    subtitleTracks,
    setSelectedSubtitleId,
    setSubtitleVisible,
    source,
    switchToHls,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
  });

  const handleSelectSubtitleWithReload = useCallback(
    (subtitleId: string) => {
      handleSelectSubtitle(subtitleId);
      if (subtitleId) {
        setSubtitleTrackRevision((previous) => previous + 1);
      }
    },
    [handleSelectSubtitle],
  );

  usePlayerBroadcastSync({
    broadcastEnabled,
    userId: user.id,
    mediaId,
    loading,
    switchingToHls,
    source,
    selectedAudioStreamIndex,
    activeSubtitleUrl: activeSubtitle?.url ?? null,
    subtitleFontPreset,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    currentTime,
    isPlaying,
    switchToHls,
    updateBroadcastSource,
    updateBroadcastPlayback,
  });

  usePlayerTrackCycleShortcuts({
    enabled: isTvMode,
    audioTracks,
    selectedAudioStreamIndex,
    subtitleTracks,
    selectedSubtitleId,
    onSelectAudioTrack: handleSelectAudioTrack,
    onSelectSubtitle: handleSelectSubtitle,
    onToggleNerdStats: toggleNerdStats,
  });

  const {
    hlsLevels,
    qualityMode,
    setQualityMode,
    currentAutoLevel,
    estimatedBandwidthBps,
    attemptedHlsFallbackRef,
  } = usePlayerMediaSource({
    videoRef,
    source,
    restartHlsSession,
    hasAppliedInitialSeekRef,
    setPlayerError,
    setIsBuffering,
    setCurrentTime,
    setDuration,
    setSeekValue,
    setBufferedPercent,
  });

  const {
    effectiveVideoBitrateQuotaKbps,
    resolutionHeightOptions,
    videoBitrateOptionsKbps,
    audioBitrateOptionsKbps,
    handlePreferredVideoBitrateChange,
    handlePreferredAudioBitrateChange,
    handlePreferredResolutionChange,
  } = usePlayerQualityPreferences({
    source,
    accountVideoQuotaKbps,
    maxResolutionForBitrateBudget,
    preferredMaxResolutionHeight,
    setPreferredVideoBitrateKbps,
    setPreferredAudioBitrateKbps,
    setPreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    selectedAudioStreamIndex,
    switchToHls,
  });

  const redactedStreamUrl = useMemo(() => {
    return redactAccessToken(source?.url);
  }, [source?.url]);

  const runtime = usePlayerPlaybackRuntime({
    token,
    mediaId,
    hideTopNav,
    isTvMode,
    playerTitle,
    source,
    switchingToHls,
    selectedSubtitle,
    subtitleTracks,
    activeSubtitleUrl: activeSubtitle?.url ?? null,
    requestedStartSeconds,
    resumeAtSeconds,
    totalDuration,
    currentTime,
    seekValue,
    isPlaying,
    isSeeking,
    isControlsVisible,
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
  });

  const {
    activeTheaterMode,
    playerPageClassName,
    panelProps,
    episodeNavigationProps,
    detailsProps,
  } = usePlayerPlaybackViewState({
    token,
    hideTopNav,
    isTvMode,
    theaterMode,
    media,
    source,
    redactedStreamUrl,
    trackState: {
      audioTracks,
      selectedAudioStreamIndex,
      subtitleTracks,
      selectedSubtitleId,
      subtitleTrackRevision,
      extractingSubtitleTrackId,
    },
    playbackState: {
      activeSubtitle,
      isControlsVisible,
      isPlaying,
      isSeeking,
      isBuffering,
      isFullscreen,
      isPictureInPicture,
      muted,
      volume,
      playbackRate,
      subtitleFontPreset,
      currentTime,
      totalDuration,
      safeDuration,
      playedPercent,
      bufferedPercent,
      seekValue,
      seekPreviewSeconds,
    },
    capabilities: {
      canUsePictureInPicture: runtime.canUsePictureInPicture,
      canCast: runtime.canCast,
      castDeviceAvailable: runtime.castDeviceAvailable,
      isCasting: runtime.isCasting,
    },
    qualityStateBase: {
      estimatedBandwidthBps,
      hlsLevels,
      qualityMode,
      videoBitrateQuotaKbps: effectiveVideoBitrateQuotaKbps,
      videoBitrateOptionsKbps,
      audioBitrateOptionsKbps,
      resolutionHeightOptions,
      preferredVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      preferredAudioBitrateKbps: effectivePreferredAudioBitrateKbps,
      preferredMaxResolutionHeight: effectivePreferredMaxResolutionHeight,
    },
    sourceHasHls: Boolean(source?.hls),
    currentAutoLevel,
    diagnostics: {
      showNerdStats,
      hlsSessionStats,
      hlsSessionStatsError,
      hlsSessionStatsUpdatedAt,
      videoTelemetry,
      toggleNerdStats,
    },
    refs: { videoRef, videoShellRef },
    runtime,
    selectionHandlers: {
      onSelectAudioTrack: handleSelectAudioTrack,
      onSelectSubtitle: handleSelectSubtitleWithReload,
    },
    extractSubtitleContext: {
      setSelectedSubtitleId,
      setSubtitleVisible,
      persistSeriesPlaybackPreference,
      extractTrack,
    },
    preferenceHandlers: {
      onSubtitleFontPresetChange: setSubtitleFontPreset,
      onQualityModeChange: runtime.handleQualityModeChange,
      onPreferredVideoBitrateChange: handlePreferredVideoBitrateChange,
      onPreferredAudioBitrateChange: handlePreferredAudioBitrateChange,
      onPreferredResolutionChange: handlePreferredResolutionChange,
    },
    episodeNavigationContext: {
      previousEpisode,
      nextEpisode,
      previousEpisodeImage,
      nextEpisodeImage,
      autoAdvanceSeconds,
      cancelAutoAdvance,
      navigate,
    },
    detailsContext: {
      totalDuration,
      currentTime,
      onOpenDetails: openCurrentDetails,
      broadcastEnabled,
      broadcastViewers,
    },
  });

  return (
    <PlayerPlaybackPageView
      playerPageClassName={playerPageClassName}
      hideTopNav={hideTopNav}
      isTvMode={isTvMode}
      headerContent={headerContent}
      playerTitle={playerTitle}
      query={query}
      onQueryChange={setQuery}
      onSearchSubmit={handleSearch}
      onBack={handleBackNavigation}
      onOpenRandomDetails={openRandomDetails}
      user={user}
      onLogout={onLogout}
      loading={loading}
      switchingToHls={switchingToHls}
      error={error}
      playerError={playerError}
      activeTheaterMode={activeTheaterMode}
      panelProps={panelProps}
      episodeNavigationProps={episodeNavigationProps}
      detailsProps={detailsProps}
      preparation={addonPreparation}
    />
  );
}
