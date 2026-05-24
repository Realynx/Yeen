import { useCallback, useMemo } from 'react';
import type { ComponentProps } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { PlayerPanelContainer } from '../components/PlayerPanelContainer';
import { PlayerPlaybackLayout } from '../components/PlayerPlaybackLayout';
import type { SubtitleTrack } from '../../shared/services/types';

type PanelProps = ComponentProps<typeof PlayerPanelContainer>;
type EpisodeNavigationProps = ComponentProps<typeof PlayerPlaybackLayout>['episodeNavigationProps'];
type DetailsProps = ComponentProps<typeof PlayerPlaybackLayout>['detailsProps'];

interface ExtractSubtitleContext {
  setSelectedSubtitleId: (subtitleId: string) => void;
  setSubtitleVisible: (visible: boolean) => void;
  persistSeriesPlaybackPreference: (payload: {
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  }) => Promise<void>;
  extractTrack: (track: SubtitleTrack) => Promise<void> | void;
}

interface EpisodeNavigationContext {
  previousEpisode: EpisodeNavigationProps['previousEpisode'];
  nextEpisode: EpisodeNavigationProps['nextEpisode'];
  previousEpisodeImage: EpisodeNavigationProps['previousEpisodeImage'];
  nextEpisodeImage: EpisodeNavigationProps['nextEpisodeImage'];
  navigate: NavigateFunction;
}

interface DetailsContext {
  totalDuration: number;
  currentTime: number;
  onOpenDetails: () => void;
}

interface UsePlayerPlaybackViewStateArgs {
  token: string;
  hideTopNav: boolean;
  theaterMode: boolean;
  media: PanelProps['media'];
  source: PanelProps['source'];
  redactedStreamUrl: string | null;
  trackState: PanelProps['trackState'];
  playbackState: PanelProps['playbackState'];
  capabilities: PanelProps['capabilities'];
  qualityStateBase: Omit<PanelProps['qualityState'], 'qualityStatus'>;
  sourceHasHls: boolean;
  currentAutoLevel: number | null;
  diagnostics: PanelProps['diagnostics'];
  refs: PanelProps['refs'];
  runtime: PanelProps['runtime'];
  selectionHandlers: Omit<PanelProps['selectionHandlers'], 'onExtractSubtitle'>;
  extractSubtitleContext: ExtractSubtitleContext;
  preferenceHandlers: PanelProps['preferenceHandlers'];
  episodeNavigationContext: EpisodeNavigationContext;
  detailsContext: DetailsContext;
}

interface PlayerPlaybackViewState {
  activeTheaterMode: boolean;
  playerPageClassName: string;
  panelProps: PanelProps;
  episodeNavigationProps: EpisodeNavigationProps;
  detailsProps: DetailsProps;
}

export function usePlayerPlaybackViewState({
  token,
  hideTopNav,
  theaterMode,
  media,
  source,
  redactedStreamUrl,
  trackState,
  playbackState,
  capabilities,
  qualityStateBase,
  sourceHasHls,
  currentAutoLevel,
  diagnostics,
  refs,
  runtime,
  selectionHandlers,
  extractSubtitleContext,
  preferenceHandlers,
  episodeNavigationContext,
  detailsContext,
}: UsePlayerPlaybackViewStateArgs): PlayerPlaybackViewState {
  const activeTheaterMode = hideTopNav ? false : theaterMode;
  const playerPageClassName = hideTopNav ? 'player-page phone-player-page' : 'player-page';
  const {
    setSelectedSubtitleId,
    setSubtitleVisible,
    persistSeriesPlaybackPreference,
    extractTrack,
  } = extractSubtitleContext;

  const qualityStatus = useMemo(() => {
    if (!sourceHasHls) {
      return 'Direct Play';
    }

    if (qualityStateBase.qualityMode === 'auto') {
      const level = qualityStateBase.hlsLevels.find((item) => item.index === currentAutoLevel);
      return level ? `Auto (${level.label})` : 'Auto';
    }

    const selectedLevel = qualityStateBase.hlsLevels.find(
      (item) => item.index === qualityStateBase.qualityMode,
    );
    return selectedLevel?.label ?? 'Manual';
  }, [currentAutoLevel, qualityStateBase.hlsLevels, qualityStateBase.qualityMode, sourceHasHls]);

  const handleExtractSubtitle = useCallback((track: SubtitleTrack) => {
    setSelectedSubtitleId(track.id);
    setSubtitleVisible(true);
    void persistSeriesPlaybackPreference({
      preferredSubtitleLanguage: track.language ?? null,
      subtitlePreferenceEnabled: true,
    });
    void extractTrack(track);
  }, [extractTrack, persistSeriesPlaybackPreference, setSelectedSubtitleId, setSubtitleVisible]);

  const panelProps: PanelProps = {
    token,
    media,
    source,
    redactedStreamUrl,
    activeTheaterMode,
    trackState,
    playbackState,
    capabilities,
    qualityState: {
      qualityStatus,
      ...qualityStateBase,
    },
    diagnostics,
    refs,
    runtime,
    selectionHandlers: {
      ...selectionHandlers,
      onExtractSubtitle: handleExtractSubtitle,
    },
    preferenceHandlers,
  };

  const episodeNavigationProps: EpisodeNavigationProps = {
    isShowMedia: media?.type === 'show',
    previousEpisode: episodeNavigationContext.previousEpisode,
    nextEpisode: episodeNavigationContext.nextEpisode,
    previousEpisodeImage: episodeNavigationContext.previousEpisodeImage,
    nextEpisodeImage: episodeNavigationContext.nextEpisodeImage,
    onNavigateToEpisode: (episodeId) => episodeNavigationContext.navigate(`/player/${episodeId}`),
  };

  const detailsProps: DetailsProps = {
    media,
    totalDuration: detailsContext.totalDuration,
    currentTime: detailsContext.currentTime,
    showKeyboardShortcuts: !hideTopNav,
    onOpenDetails: detailsContext.onOpenDetails,
  };

  return {
    activeTheaterMode,
    playerPageClassName,
    panelProps,
    episodeNavigationProps,
    detailsProps,
  };
}
