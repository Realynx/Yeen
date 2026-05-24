import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PlayerDetails } from '../components/PlayerDetails';
import { PlayerVideoPanel } from '../components/PlayerVideoPanel';
import { listMedia, upsertProgress } from '../../shared/services/api';
import type { User } from '../../shared/services/types';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { PlayerPreparingPanel } from '../components/PlayerPreparingPanel';
import { PlayerDownloadProgress } from '../components/PlayerDownloadProgress';
import { PlayerEpisodeNavigation } from '../components/PlayerEpisodeNavigation';
import { PlayerStatusOverlay } from '../components/PlayerStatusOverlay';
import { PlayerTopBar } from '../components/PlayerTopBar';
import { usePlayerData } from '../services/usePlayerData';
import { usePlayerKeyboardShortcuts } from '../services/usePlayerKeyboardShortcuts';
import { usePlayerMediaSource } from '../services/usePlayerMediaSource';
import { usePlayerPageEffects } from '../services/usePlayerPageEffects';
import { usePlayerTimelineHandlers } from '../services/usePlayerTimelineHandlers';
import { usePlayerVideoPanelHandlers } from '../services/usePlayerVideoPanelHandlers';
import { usePlayerControlsTimer } from '../services/usePlayerControlsTimer';
import { usePlayerInteractions } from '../services/usePlayerInteractions';
import { usePlayerCasting } from '../services/usePlayerCasting';
import { usePlayerDiagnostics } from '../services/usePlayerDiagnostics';
import { useShowEpisodes } from '../services/useShowEpisodes';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import {
  clamp,
  readPlayerPreferences,
  STANDARD_AUDIO_BITRATE_OPTIONS_KBPS,
  STANDARD_RESOLUTION_HEIGHT_OPTIONS,
  STANDARD_VIDEO_BITRATE_OPTIONS_KBPS,
  toResolutionBitrateHintKbps,
} from '../services/playerUtils';

interface PlayerPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

const PLAYER_SCRUBBING_CLASS = 'is-player-scrubbing';

function redactAccessToken(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    parsed.searchParams.delete('access_token');
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/([?&])access_token=[^&]+/gi, '$1').replace(/[?&]$/, '');
  }
}

function toUniqueSortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps: number): number {
  let highestAllowed: number = STANDARD_RESOLUTION_HEIGHT_OPTIONS[0];

  for (const height of STANDARD_RESOLUTION_HEIGHT_OPTIONS) {
    if (toResolutionBitrateHintKbps(height) <= bitrateBudgetKbps) {
      highestAllowed = height;
    }
  }

  return highestAllowed;
}

export function PlayerPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();

  const prepareHash = searchParams.get('prepareHash')?.trim() ?? '';
  const fallbackTitle = searchParams.get('title') ?? '';

  if (prepareHash) {
    return (
      <PlayerPreparingPanel
        token={token}
        user={user}
        onLogout={onLogout}
        mediaId={mediaId}
        hash={prepareHash}
        fallbackTitle={fallbackTitle}
        hideTopNav={hideTopNav}
        headerContent={headerContent}
      />
    );
  }

  return (
    <PlayerPlaybackPage
      token={token}
      user={user}
      onLogout={onLogout}
      hideTopNav={hideTopNav}
      headerContent={headerContent}
    />
  );
}

interface PlayerPlaybackPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

function PlayerPlaybackPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPlaybackPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  const openRandomDetails = useCallback(async () => {
    try {
      const mediaItems = await listMedia(token);
      const randomCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!randomCandidate) {
        return;
      }

      navigate(`/details/${randomCandidate.id}`);
    } catch {
      // Keep playback uninterrupted if random details lookup fails.
    }
  }, [navigate, token]);

  const openCurrentDetails = useCallback(() => {
    if (!mediaId) {
      return;
    }

    navigate(`/details/${mediaId}`);
  }, [mediaId, navigate]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [mediaId]);

  const initialPreferences = useMemo(() => readPlayerPreferences(), []);

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
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [theaterMode, setTheaterMode] = useState(initialPreferences.theaterMode);
  const [volume, setVolume] = useState(initialPreferences.volume);
  const [muted, setMuted] = useState(initialPreferences.muted);
  const [playbackRate, setPlaybackRate] = useState(initialPreferences.playbackRate);
  const [subtitleFontPreset, setSubtitleFontPreset] =
    useState(initialPreferences.subtitleFontPreset);
  const [preferredVideoBitrateKbps, setPreferredVideoBitrateKbps] =
    useState<number | null>(initialPreferences.preferredVideoBitrateKbps);
  const [preferredAudioBitrateKbps, setPreferredAudioBitrateKbps] =
    useState<number | null>(initialPreferences.preferredAudioBitrateKbps);
  const [preferredMaxResolutionHeight, setPreferredMaxResolutionHeight] =
    useState<number | null>(initialPreferences.preferredMaxResolutionHeight);

  const accountVideoQuotaKbps = useMemo(() => {
    if (typeof user.maxBitrateKbps === 'number' && Number.isFinite(user.maxBitrateKbps)) {
      return clamp(Math.round(user.maxBitrateKbps), 250, 50000);
    }

    return 50000;
  }, [user.maxBitrateKbps]);

  const effectivePreferredVideoBitrateKbps = useMemo(() => {
    if (typeof preferredVideoBitrateKbps !== 'number' || !Number.isFinite(preferredVideoBitrateKbps)) {
      return null;
    }

    return clamp(Math.round(preferredVideoBitrateKbps), 250, accountVideoQuotaKbps);
  }, [accountVideoQuotaKbps, preferredVideoBitrateKbps]);

  const effectivePreferredAudioBitrateKbps = useMemo(() => {
    if (typeof preferredAudioBitrateKbps !== 'number' || !Number.isFinite(preferredAudioBitrateKbps)) {
      return null;
    }

    return clamp(Math.round(preferredAudioBitrateKbps), 48, 384);
  }, [preferredAudioBitrateKbps]);

  const maxResolutionForBitrateBudget = useMemo(() => {
    const bitrateBudgetKbps = effectivePreferredVideoBitrateKbps ?? accountVideoQuotaKbps;
    return resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps);
  }, [accountVideoQuotaKbps, effectivePreferredVideoBitrateKbps]);

  const effectivePreferredMaxResolutionHeight = useMemo(() => {
    if (
      typeof preferredMaxResolutionHeight !== 'number'
      || !Number.isFinite(preferredMaxResolutionHeight)
    ) {
      return null;
    }

    return Math.min(
      clamp(Math.round(preferredMaxResolutionHeight), 240, 2160),
      maxResolutionForBitrateBudget,
    );
  }, [maxResolutionForBitrateBudget, preferredMaxResolutionHeight]);

  const transcodePreferences = useMemo(() => {
    return {
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    };
  }, [
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
  ]);

  const {
    media,
    source,
    streamTorrentHash,
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

  const {
    downloadingTorrent,
    showNerdStats,
    hlsSessionStats,
    hlsSessionStatsError,
    hlsSessionStatsUpdatedAt,
    videoTelemetry,
    toggleNerdStats,
  } = usePlayerDiagnostics({ token, source, streamTorrentHash, videoRef });

  useEffect(() => {
    if (!isSeeking) {
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
      return;
    }

    const preventSelection = (event: Event) => {
      event.preventDefault();
    };

    const clearSelection = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      } catch {
        // Ignore selection API edge cases during scrubbing.
      }
    };

    document.body.classList.add(PLAYER_SCRUBBING_CLASS);
    clearSelection();
    document.addEventListener('selectstart', preventSelection);
    document.addEventListener('dragstart', preventSelection);
    document.addEventListener('selectionchange', clearSelection);

    return () => {
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('dragstart', preventSelection);
      document.removeEventListener('selectionchange', clearSelection);
      document.body.classList.remove(PLAYER_SCRUBBING_CLASS);
    };
  }, [isSeeking]);

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
    if (duration > 0) {
      return duration;
    }

    return Math.max(media?.durationSeconds ?? 0, 0);
  }, [duration, media?.durationSeconds]);

  const safeDuration = Math.max(totalDuration, 1);
  const playedPercent = clamp((currentTime / safeDuration) * 100, 0, 100);

  const activeSubtitle = subtitleVisible && selectedSubtitle?.url ? selectedSubtitle : null;
  const playerTitle =
    media?.type === 'show' && media.episodeTitle?.trim()
      ? media.episodeTitle.trim()
      : media?.title ?? 'Player';

  const {
    previousEpisode,
    nextEpisode,
    previousEpisodeImage,
    nextEpisodeImage,
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

  const persistSeriesPlaybackPreference = useCallback(
    async (payload: {
      preferredAudioLanguage?: string | null;
      preferredSubtitleLanguage?: string | null;
      subtitlePreferenceEnabled?: boolean | null;
    }) => {
      if (!mediaId || media?.type !== 'show') {
        return;
      }

      const seriesPreferenceKey = normalizeShowKey(media).trim();
      if (!seriesPreferenceKey) {
        return;
      }

      const video = videoRef.current;
      const safeVideoDuration = Number.isFinite(video?.duration)
        ? Number(video?.duration)
        : totalDuration;
      const syncTimestampMs = Math.max(
        Date.now(),
        progressSyncTimestampRef.current + 1,
      );
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(token, mediaId, {
          positionSeconds: Math.max(0, Math.floor(video?.currentTime ?? currentTime)),
          durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
          syncTimestampMs,
          completed: false,
          seriesPreferenceKey,
          ...payload,
        });
      } catch {
        // Keep playback uninterrupted if preference persistence fails.
      }
    },
    [currentTime, media, mediaId, token, totalDuration],
  );

  function handleSelectAudioTrack(audioStreamIndex: number) {
    if (selectedAudioStreamIndex === audioStreamIndex) {
      return;
    }

    setSelectedAudioStreamIndex(audioStreamIndex);

    const selectedTrack =
      audioTracks.find((track) => track.streamIndex === audioStreamIndex) ?? null;
    void persistSeriesPlaybackPreference({
      preferredAudioLanguage: selectedTrack?.language ?? null,
    });

    const defaultAudioStreamIndex =
      audioTracks.find((track) => track.isDefault)?.streamIndex
      ?? audioTracks[0]?.streamIndex
      ?? null;

    if (source?.hls) {
      const requiresRestart = source.audioStreamIndex !== audioStreamIndex;
      if (requiresRestart) {
        void switchToHls({
          forceFresh: true,
          audioStreamIndex,
          maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
          audioBitrateKbps: effectivePreferredAudioBitrateKbps,
          maxOutputHeight: effectivePreferredMaxResolutionHeight,
        });
      }
      return;
    }

    if (
      defaultAudioStreamIndex !== null
      && audioStreamIndex !== defaultAudioStreamIndex
    ) {
      void switchToHls({
        audioStreamIndex,
        maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
        audioBitrateKbps: effectivePreferredAudioBitrateKbps,
        maxOutputHeight: effectivePreferredMaxResolutionHeight,
      });
    }
  }

  const handleSelectSubtitle = useCallback(
    (subtitleId: string) => {
      setSelectedSubtitleId(subtitleId);
      setSubtitleVisible(subtitleId !== '');

      const selectedTrack = subtitleId
        ? subtitleTracks.find((track) => track.id === subtitleId) ?? null
        : null;

      void persistSeriesPlaybackPreference({
        preferredSubtitleLanguage: selectedTrack?.language ?? null,
        subtitlePreferenceEnabled: subtitleId !== '',
      });
    },
    [persistSeriesPlaybackPreference, setSelectedSubtitleId, subtitleTracks],
  );

  useEffect(() => {
    // Keep local visibility state aligned when subtitle selection changes externally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtitleVisible(selectedSubtitleId !== '');
  }, [mediaId, selectedSubtitleId]);

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

  const qualityStatus = useMemo(() => {
    if (!source?.hls) {
      return 'Direct Play';
    }

    if (qualityMode === 'auto') {
      const level = hlsLevels.find((item) => item.index === currentAutoLevel);
      return level ? `Auto (${level.label})` : 'Auto';
    }

    const selectedLevel = hlsLevels.find((item) => item.index === qualityMode);
    return selectedLevel?.label ?? 'Manual';
  }, [currentAutoLevel, hlsLevels, qualityMode, source?.hls]);

  const effectiveVideoBitrateQuotaKbps = useMemo(() => {
    if (
      source?.hls
      && typeof source.maxVideoBitrateKbps === 'number'
      && Number.isFinite(source.maxVideoBitrateKbps)
    ) {
      return Math.min(
        accountVideoQuotaKbps,
        clamp(Math.round(source.maxVideoBitrateKbps), 250, 50000),
      );
    }

    return accountVideoQuotaKbps;
  }, [accountVideoQuotaKbps, source?.hls, source?.maxVideoBitrateKbps]);

  const effectiveResolutionCeilingForUi = useMemo(() => {
    const sourceCeiling =
      source?.hls
      && typeof source.maxOutputHeight === 'number'
      && Number.isFinite(source.maxOutputHeight)
        ? clamp(Math.round(source.maxOutputHeight), 240, 2160)
        : 2160;

    return Math.min(sourceCeiling, maxResolutionForBitrateBudget);
  }, [maxResolutionForBitrateBudget, source?.hls, source?.maxOutputHeight]);

  const resolutionHeightOptions = useMemo(() => {
    const options: number[] = STANDARD_RESOLUTION_HEIGHT_OPTIONS.filter((height) => {
      return (
        height <= effectiveResolutionCeilingForUi
        && toResolutionBitrateHintKbps(height) <= effectiveVideoBitrateQuotaKbps
      );
    });

    if (options.length === 0) {
      options.push(STANDARD_RESOLUTION_HEIGHT_OPTIONS[0]);
    }

    if (typeof effectivePreferredMaxResolutionHeight === 'number') {
      options.push(effectivePreferredMaxResolutionHeight);
    }

    return toUniqueSortedNumbers(options);
  }, [
    effectivePreferredMaxResolutionHeight,
    effectiveResolutionCeilingForUi,
    effectiveVideoBitrateQuotaKbps,
  ]);

  const videoBitrateOptionsKbps = useMemo(() => {
    const options: number[] = STANDARD_VIDEO_BITRATE_OPTIONS_KBPS.filter((value) => {
      return value <= effectiveVideoBitrateQuotaKbps;
    });

    if (options.length === 0) {
      options.push(effectiveVideoBitrateQuotaKbps);
    }

    if (!options.includes(effectiveVideoBitrateQuotaKbps)) {
      options.push(effectiveVideoBitrateQuotaKbps);
    }

    if (typeof effectivePreferredVideoBitrateKbps === 'number') {
      options.push(effectivePreferredVideoBitrateKbps);
    }

    if (
      source?.hls
      && typeof source.maxVideoBitrateKbps === 'number'
      && Number.isFinite(source.maxVideoBitrateKbps)
    ) {
      options.push(clamp(Math.round(source.maxVideoBitrateKbps), 250, 50000));
    }

    return toUniqueSortedNumbers(
      options.filter((value) => Number.isFinite(value) && value >= 250 && value <= 50000),
    );
  }, [
    effectivePreferredVideoBitrateKbps,
    effectiveVideoBitrateQuotaKbps,
    source?.hls,
    source?.maxVideoBitrateKbps,
  ]);

  const audioBitrateOptionsKbps = useMemo(() => {
    const options: number[] = [...STANDARD_AUDIO_BITRATE_OPTIONS_KBPS];

    if (typeof effectivePreferredAudioBitrateKbps === 'number') {
      options.push(effectivePreferredAudioBitrateKbps);
    }

    if (
      source?.hls
      && typeof source.audioBitrateKbps === 'number'
      && Number.isFinite(source.audioBitrateKbps)
    ) {
      options.push(clamp(Math.round(source.audioBitrateKbps), 48, 384));
    }

    return toUniqueSortedNumbers(
      options.filter((value) => Number.isFinite(value) && value >= 48 && value <= 384),
    );
  }, [effectivePreferredAudioBitrateKbps, source?.audioBitrateKbps, source?.hls]);

  const handlePreferredVideoBitrateChange = useCallback((nextVideoBitrateKbps: number | null) => {
    const normalizedVideoBitrateKbps =
      typeof nextVideoBitrateKbps === 'number' && Number.isFinite(nextVideoBitrateKbps)
        ? clamp(Math.round(nextVideoBitrateKbps), 250, effectiveVideoBitrateQuotaKbps)
        : null;

    setPreferredVideoBitrateKbps(normalizedVideoBitrateKbps);

    if (!source?.hls) {
      return;
    }

    const nextBitrateBudgetKbps =
      normalizedVideoBitrateKbps ?? accountVideoQuotaKbps;
    const nextResolutionCeiling = resolveMaxResolutionForBitrateBudget(
      nextBitrateBudgetKbps,
    );
    const nextMaxOutputHeight =
      typeof preferredMaxResolutionHeight === 'number'
        ? Math.min(
            clamp(Math.round(preferredMaxResolutionHeight), 240, 2160),
            nextResolutionCeiling,
          )
        : null;

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: normalizedVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: nextMaxOutputHeight,
    });
  }, [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectiveVideoBitrateQuotaKbps,
    preferredMaxResolutionHeight,
    selectedAudioStreamIndex,
    source?.hls,
    switchToHls,
  ]);

  const handlePreferredAudioBitrateChange = useCallback((nextAudioBitrateKbps: number | null) => {
    const normalizedAudioBitrateKbps =
      typeof nextAudioBitrateKbps === 'number' && Number.isFinite(nextAudioBitrateKbps)
        ? clamp(Math.round(nextAudioBitrateKbps), 48, 384)
        : null;

    setPreferredAudioBitrateKbps(normalizedAudioBitrateKbps);

    if (!source?.hls) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: normalizedAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    });
  }, [
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    selectedAudioStreamIndex,
    source?.hls,
    switchToHls,
  ]);

  const handlePreferredResolutionChange = useCallback((nextMaxResolutionHeight: number | null) => {
    const sourceCeiling =
      source?.hls
      && typeof source.maxOutputHeight === 'number'
      && Number.isFinite(source.maxOutputHeight)
        ? clamp(Math.round(source.maxOutputHeight), 240, 2160)
        : 2160;
    const bitrateBudgetKbps =
      effectivePreferredVideoBitrateKbps ?? accountVideoQuotaKbps;
    const bitrateCeiling = resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps);
    const effectiveCeiling = Math.min(sourceCeiling, bitrateCeiling);

    const normalizedMaxResolutionHeight =
      typeof nextMaxResolutionHeight === 'number'
      && Number.isFinite(nextMaxResolutionHeight)
        ? Math.min(clamp(Math.round(nextMaxResolutionHeight), 240, 2160), effectiveCeiling)
        : null;

    setPreferredMaxResolutionHeight(normalizedMaxResolutionHeight);

    if (!source?.hls) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: normalizedMaxResolutionHeight,
    });
  }, [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredVideoBitrateKbps,
    selectedAudioStreamIndex,
    source?.hls,
    source?.maxOutputHeight,
    switchToHls,
  ]);

  const redactedStreamUrl = useMemo(() => {
    return redactAccessToken(source?.url);
  }, [source?.url]);

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
      const syncTimestampMs = Math.max(
        Date.now(),
        progressSyncTimestampRef.current + 1,
      );
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(
          token,
          mediaId,
          {
            positionSeconds: Math.max(0, Math.floor(video.currentTime || 0)),
            durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
            syncTimestampMs,
            completed,
          },
          { keepalive },
        );
      } catch {
        // Keep playback uninterrupted if progress persistence fails.
      }
    },
    [mediaId, token, totalDuration],
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
    activeSubtitleUrl: activeSubtitle?.url ?? null,
    setIsFullscreen,
    setIsPictureInPicture,
    syncProgress,
  });

  useEffect(() => {
    hasAppliedInitialSeekRef.current = false;
  }, [mediaId, requestedStartSeconds, source?.url]);

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

  const activeTheaterMode = hideTopNav ? false : theaterMode;

  const playerPageClassName = hideTopNav
    ? 'player-page phone-player-page'
    : 'player-page';

  return (
    <main className={playerPageClassName}>
      {headerContent}

      {!hideTopNav ? (
        <PlayerTopBar
          title={playerTitle}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearch}
          onBack={handleBackNavigation}
          onOpenRandomDetails={openRandomDetails}
          user={user}
          onLogout={onLogout}
        />
      ) : null}

      <PlayerStatusOverlay
        loading={loading}
        switchingToHls={switchingToHls}
        error={error}
        playerError={playerError}
      />

      <PlayerDownloadProgress torrent={downloadingTorrent} />

      <section className={`player-layout ${activeTheaterMode ? 'player-layout-theater' : ''}`}>
        <PlayerVideoPanel
          token={token}
          media={media}
          audioTracks={audioTracks}
          selectedAudioStreamIndex={selectedAudioStreamIndex}
          onSelectAudioTrack={handleSelectAudioTrack}
          activeSubtitle={activeSubtitle}
          subtitleTracks={subtitleTracks}
          selectedSubtitleId={selectedSubtitleId}
          onSelectSubtitle={handleSelectSubtitle}
          onExtractSubtitle={(track) => {
            setSelectedSubtitleId(track.id);
            setSubtitleVisible(true);
            void persistSeriesPlaybackPreference({
              preferredSubtitleLanguage: track.language ?? null,
              subtitlePreferenceEnabled: true,
            });
            void extractTrack(track);
          }}
          extractingSubtitleTrackId={extractingSubtitleTrackId}
          videoRef={videoRef}
          videoShellRef={videoShellRef}
          isControlsVisible={isControlsVisible}
          isPlaying={isPlaying}
          isSeeking={isSeeking}
          isBuffering={isBuffering}
          isFullscreen={isFullscreen}
          isPictureInPicture={isPictureInPicture}
          canUsePictureInPicture={canUsePictureInPicture}
          canCast={canCast}
          castDeviceAvailable={castDeviceAvailable}
          isCasting={isCasting}
          muted={muted}
          volume={volume}
          playbackRate={playbackRate}
          subtitleFontPreset={subtitleFontPreset}
          theaterMode={activeTheaterMode}
          isPhoneMode={hideTopNav}
          currentTime={currentTime}
          totalDuration={totalDuration}
          safeDuration={safeDuration}
          playedPercent={playedPercent}
          bufferedPercent={bufferedPercent}
          seekValue={seekValue}
          seekPreviewSeconds={seekPreviewSeconds}
          qualityStatus={qualityStatus}
          isHlsSource={Boolean(source?.hls)}
          estimatedBandwidthBps={estimatedBandwidthBps}
          hlsLevels={hlsLevels}
          qualityMode={qualityMode}
          videoBitrateQuotaKbps={effectiveVideoBitrateQuotaKbps}
          videoBitrateOptionsKbps={videoBitrateOptionsKbps}
          audioBitrateOptionsKbps={audioBitrateOptionsKbps}
          resolutionHeightOptions={resolutionHeightOptions}
          preferredVideoBitrateKbps={effectivePreferredVideoBitrateKbps}
          preferredAudioBitrateKbps={effectivePreferredAudioBitrateKbps}
          preferredMaxResolutionHeight={effectivePreferredMaxResolutionHeight}
          appliedVideoBitrateKbps={source?.hls ? source.maxVideoBitrateKbps : null}
          appliedAudioBitrateKbps={source?.hls ? source.audioBitrateKbps : null}
          appliedMaxOutputHeight={source?.hls ? source.maxOutputHeight : null}
          showNerdStats={showNerdStats}
          streamSessionId={source?.hlsSessionId ?? null}
          streamUrl={redactedStreamUrl}
          hlsSessionStats={hlsSessionStats}
          hlsSessionStatsError={hlsSessionStatsError}
          hlsSessionStatsUpdatedAt={hlsSessionStatsUpdatedAt}
          videoTelemetry={videoTelemetry}
          downloadingTorrent={downloadingTorrent}
          onRevealControls={revealControls}
          onHideControls={hideControls}
          onToggleNerdStats={toggleNerdStats}
          onTogglePlay={() => { void togglePlay(); }}
          onToggleFullscreen={() => { void toggleFullscreen(); }}
          onToggleMute={toggleMute}
          onToggleTheaterMode={handleToggleTheaterMode}
          onTogglePictureInPicture={() => { void togglePictureInPicture(); }}
          onOpenCastPicker={() => { void openCastPicker(); }}
          onSkipBy={skipBy}
          onSeekTo={seekTo}
          onApplyVolume={applyVolume}
          onPlaybackRateChange={handlePlaybackRateChange}
          onSubtitleFontPresetChange={setSubtitleFontPreset}
          onQualityModeChange={handleQualityModeChange}
          onPreferredVideoBitrateChange={handlePreferredVideoBitrateChange}
          onPreferredAudioBitrateChange={handlePreferredAudioBitrateChange}
          onPreferredResolutionChange={handlePreferredResolutionChange}
          onClearSeekPreview={clearSeekPreview}
          onSeekPreview={handleSeekPreview}
          onSeekInputChange={handleSeekInputChange}
          onSeekPointerDown={handleSeekPointerDown}
          onSeekPointerUp={handleSeekPointerUp}
          onSeekTouchEnd={handleSeekTouchEnd}
          onVideoPlay={handleVideoPlay}
          onVideoPause={handleVideoPause}
          onVideoEnded={handleVideoEndedWithAutoNext}
          onVideoTimeUpdate={handleTimeUpdate}
          onVideoDurationChange={handleDurationChange}
          onVideoLoadedMetadata={handleLoadedMetadata}
          onVideoProgress={handleBufferedProgress}
          onVideoWaiting={handleVideoWaiting}
          onVideoPlaying={handleVideoReady}
          onVideoCanPlay={handleVideoReady}
          onVideoError={handleVideoError}
        />
      </section>

      <PlayerEpisodeNavigation
        isShowMedia={media?.type === 'show'}
        previousEpisode={previousEpisode}
        nextEpisode={nextEpisode}
        previousEpisodeImage={previousEpisodeImage}
        nextEpisodeImage={nextEpisodeImage}
        onNavigateToEpisode={(episodeId) => navigate(`/player/${episodeId}`)}
      />

      <PlayerDetails
        media={media}
        totalDuration={totalDuration}
        currentTime={currentTime}
        showKeyboardShortcuts={!hideTopNav}
        onOpenDetails={openCurrentDetails}
      />
    </main>
  );
}
