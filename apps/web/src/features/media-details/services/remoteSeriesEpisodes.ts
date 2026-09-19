import type {
  MediaItem,
  RemoteSeriesEpisode,
  RemoteSeriesEpisodeCatalogResult,
} from '../../shared/services/types';

export interface RemoteEpisodeAddonContext {
  source: 'jikan' | 'tmdb';
  providerId: string;
  seriesId: string;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
}

export type RemoteEpisodeMediaItem = MediaItem & {
  remoteEpisodeContext: RemoteEpisodeAddonContext;
};

export interface MediaSeasonSelection {
  mediaId: string;
  seasonNumber: number;
}

export function selectedSeasonForMedia(
  selection: MediaSeasonSelection | null,
  mediaId: string,
): number | null {
  return selection?.mediaId === mediaId ? selection.seasonNumber : null;
}

export function resolveRemoteActiveSeason(
  focusedSeason: number | null,
  selectedSeason: number | null,
): number | null {
  return focusedSeason ?? selectedSeason;
}

export function remoteSeriesDetailsPath(
  source: 'jikan' | 'tmdb',
  providerId: string,
  seasonNumber: number,
  episodeNumber?: number,
): string {
  const search = new URLSearchParams({ season: String(seasonNumber) });
  if (episodeNumber !== undefined) {
    search.set('episode', String(episodeNumber));
  }
  return `/details/remote_${source}_show_${encodeURIComponent(providerId)}?${search.toString()}`;
}

export function buildRemoteEpisodeMediaItem(
  series: MediaItem,
  catalog: Extract<RemoteSeriesEpisodeCatalogResult, { status: 'ready' }>,
  episode: RemoteSeriesEpisode,
): RemoteEpisodeMediaItem {
  return {
    ...series,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.title,
    description: episode.synopsis ?? series.description,
    remoteEpisodeContext: {
      source: catalog.source,
      providerId: catalog.providerId,
      seriesId: series.id,
      seriesTitle: series.title,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
    },
  };
}
