import { Injectable, Logger } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { JikanMetadataService } from '../remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from '../remote-metadata/tmdb-metadata.service';
import {
  coercePositiveEpisodeNumber,
  coerceSeasonForTracker,
  collectSeriesItemsForEpisodeTracker,
  type EpisodeCatalogLink,
  normalizeIdList,
  orderForEpisodeAssignment,
  remoteSourceLabel,
  resolveEpisodeCatalogLink,
  normalizeOptionalString,
} from './media-episode-catalog-helpers';
import type {
  RemoteSeriesEpisodeCatalogResult,
  RemoteSeriesSeason,
} from '../media.service.types';

export interface EpisodeCatalogRemoteCandidate {
  provider: 'tmdb' | 'jikan';
  mediaType: 'movie' | 'show';
  providerId: string;
}

export interface SeriesEpisodeTrackerMissingEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export type SeriesEpisodeTrackerResult =
  | {
      status: 'unavailable';
      reason: string;
      source: null;
    }
  | {
      status: 'ready';
      source: 'jikan' | 'tmdb';
      sourceLabel: string;
      providerId: string;
      isComplete: boolean;
      completionPercent: number;
      expectedEpisodeCount: number;
      collectedEpisodeCount: number;
      missingEpisodeCount: number;
      primarySeasonNumber: number;
      seasonsSeen: number[];
      extraSeasons: number[];
      missingSeasons: number[];
      missingEpisodes: SeriesEpisodeTrackerMissingEpisode[];
      updatedAt: string;
      note: string | null;
    };

interface NormalizedSeriesCatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string | null;
  airedAt: string | null;
}

interface NormalizedSeriesEpisodeCatalog {
  source: 'jikan' | 'tmdb';
  providerId: string;
  totalEpisodeCount: number;
  episodes: NormalizedSeriesCatalogEpisode[];
  updatedAt: string;
}

interface LocalEpisodeCollection {
  seasonNumbers: Set<number>;
  episodesBySeason: Map<number, Set<number>>;
}

@Injectable()
export class MediaEpisodeCatalogService {
  private readonly logger = new Logger(MediaEpisodeCatalogService.name);

  constructor(
    private readonly mediaStore: MediaStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
  ) {}

  async getSeriesEpisodeTracker(
    current: MediaItem,
  ): Promise<SeriesEpisodeTrackerResult> {
    if (current.isRemote) {
      return {
        status: 'unavailable',
        reason: 'Series tracker is only available for indexed library items.',
        source: null,
      };
    }

    if (current.type !== 'show') {
      return {
        status: 'unavailable',
        reason: 'Series tracker is only available for show entries.',
        source: null,
      };
    }

    const catalogLink = resolveEpisodeCatalogLink(current);
    if (!catalogLink) {
      return {
        status: 'unavailable',
        reason:
          'No linked series catalog match is available yet. Re-run indexing or choose a TMDB/Jikan match in metadata edit first.',
        source: null,
      };
    }

    const catalog = await this.loadSeriesEpisodeCatalog(catalogLink);
    if (!catalog || catalog.episodes.length === 0) {
      const sourceLabel = remoteSourceLabel(catalogLink.source);
      return {
        status: 'unavailable',
        reason: `Episode catalog could not be loaded from ${sourceLabel} for this series.`,
        source: null,
      };
    }

    const allItems = await this.mediaStore.all();
    const seriesItems = collectSeriesItemsForEpisodeTracker(
      allItems,
      current,
      catalogLink,
    );

    const { seasonNumbers, episodesBySeason: localEpisodesBySeason } =
      this.collectLocalEpisodes(seriesItems);

    const seasonsSeen = [...seasonNumbers].sort((left, right) => left - right);
    const expectedSeasons = [
      ...new Set(catalog.episodes.map((episode) => episode.seasonNumber)),
    ].sort((left, right) => left - right);
    const preferredSeasonNumber = coerceSeasonForTracker(current.seasonNumber);
    const primarySeasonNumber = expectedSeasons.includes(preferredSeasonNumber)
      ? preferredSeasonNumber
      : (expectedSeasons[0] ?? seasonsSeen[0] ?? 1);

    const missingSeasons = expectedSeasons.filter(
      (seasonNumber) => !localEpisodesBySeason.has(seasonNumber),
    );

    const missingEpisodes = catalog.episodes
      .filter((episode) => {
        const localSeasonEpisodes = localEpisodesBySeason.get(
          episode.seasonNumber,
        );
        return !localSeasonEpisodes?.has(episode.episodeNumber);
      })
      .map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
      }));

    const expectedEpisodeCount = Math.max(
      catalog.totalEpisodeCount,
      catalog.episodes.length,
    );
    const collectedEpisodeCount = Math.max(
      0,
      expectedEpisodeCount - missingEpisodes.length,
    );
    const missingEpisodeCount = missingEpisodes.length;
    const completionPercent =
      expectedEpisodeCount > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round((collectedEpisodeCount / expectedEpisodeCount) * 100),
            ),
          )
        : 0;
    const extraSeasons = seasonsSeen.filter(
      (season) => !expectedSeasons.includes(season),
    );
    const isComplete = missingSeasons.length === 0 && missingEpisodeCount === 0;
    const sourceLabel = remoteSourceLabel(catalog.source);

    return {
      status: 'ready',
      source: catalog.source,
      sourceLabel,
      providerId: catalog.providerId,
      isComplete,
      completionPercent,
      expectedEpisodeCount,
      collectedEpisodeCount,
      missingEpisodeCount,
      primarySeasonNumber,
      seasonsSeen,
      extraSeasons,
      missingSeasons,
      missingEpisodes,
      updatedAt: catalog.updatedAt,
      note: this.episodeTrackerNote(
        expectedSeasons.length,
        extraSeasons.length,
        sourceLabel,
      ),
    };
  }

  async getRemoteSeriesEpisodeCatalog(
    current: MediaItem,
  ): Promise<RemoteSeriesEpisodeCatalogResult> {
    if (!current.isRemote || current.type !== 'show') {
      return {
        status: 'unavailable',
        reason: 'Episode catalogs are only available for remote series.',
        source: null,
      };
    }

    const catalogLink = resolveEpisodeCatalogLink(current);
    if (!catalogLink) {
      return {
        status: 'unavailable',
        reason: 'This remote series is not linked to an episode provider.',
        source: null,
      };
    }

    const catalog = await this.loadSeriesEpisodeCatalog(catalogLink);
    if (!catalog || catalog.episodes.length === 0) {
      return {
        status: 'unavailable',
        reason: `Episodes could not be loaded from ${remoteSourceLabel(catalogLink.source)}.`,
        source: null,
      };
    }

    const seasonsByNumber = new Map<number, RemoteSeriesSeason>();
    for (const episode of catalog.episodes) {
      const season = seasonsByNumber.get(episode.seasonNumber) ?? {
        seasonNumber: episode.seasonNumber,
        episodes: [],
      };
      season.episodes.push(episode);
      seasonsByNumber.set(episode.seasonNumber, season);
    }

    const seasons = [...seasonsByNumber.values()]
      .sort((left, right) => left.seasonNumber - right.seasonNumber)
      .map((season) => ({
        ...season,
        episodes: season.episodes.sort(
          (left, right) => left.episodeNumber - right.episodeNumber,
        ),
      }));

    return {
      status: 'ready',
      source: catalog.source,
      sourceLabel: remoteSourceLabel(catalog.source),
      providerId: catalog.providerId,
      totalEpisodeCount: Math.max(
        catalog.totalEpisodeCount,
        catalog.episodes.length,
      ),
      seasons,
      updatedAt: catalog.updatedAt,
    };
  }

  private collectLocalEpisodes(items: MediaItem[]): LocalEpisodeCollection {
    const collection: LocalEpisodeCollection = {
      seasonNumbers: new Set<number>(),
      episodesBySeason: new Map<number, Set<number>>(),
    };
    for (const item of items) {
      if (item.type !== 'show') continue;
      const episode = coercePositiveEpisodeNumber(item.episodeNumber);
      if (!episode) continue;
      const season = coerceSeasonForTracker(item.seasonNumber);
      collection.seasonNumbers.add(season);
      const episodes = collection.episodesBySeason.get(season) ?? new Set();
      episodes.add(episode);
      collection.episodesBySeason.set(season, episodes);
    }
    return collection;
  }

  private episodeTrackerNote(
    expectedSeasonCount: number,
    extraSeasonCount: number,
    sourceLabel: string,
  ): string | null {
    if (expectedSeasonCount > 1) {
      return `Multiple seasons are tracked against the linked ${sourceLabel} episode catalog.`;
    }
    if (extraSeasonCount > 0) {
      return `Local episodes include seasons outside the linked ${sourceLabel} catalog.`;
    }
    return null;
  }

  reconcileEpisodeCatalogLink(
    target: MediaItem,
    previous: MediaItem | null,
    remoteCandidate: EpisodeCatalogRemoteCandidate | null,
    warmCatalog: boolean,
  ): void {
    if (target.type !== 'show') {
      target.episodeCatalogSource = null;
      target.episodeCatalogSourceId = null;
      return;
    }

    let linkedCatalog = resolveEpisodeCatalogLink(target);

    if (
      (remoteCandidate?.provider === 'jikan' ||
        remoteCandidate?.provider === 'tmdb') &&
      remoteCandidate.mediaType === 'show'
    ) {
      linkedCatalog = {
        source: remoteCandidate.provider,
        providerId: remoteCandidate.providerId,
      };
    } else if (
      target.remoteSource === 'jikan' ||
      target.remoteSource === 'tmdb'
    ) {
      const linkedProviderId = normalizeOptionalString(target.remoteSourceId);
      linkedCatalog = linkedProviderId
        ? {
            source: target.remoteSource,
            providerId: linkedProviderId,
          }
        : null;
    } else if (target.remoteSource) {
      linkedCatalog = null;
    } else if (!linkedCatalog && previous) {
      linkedCatalog = resolveEpisodeCatalogLink(previous);
    }

    if (linkedCatalog) {
      target.episodeCatalogSource = linkedCatalog.source;
      target.episodeCatalogSourceId = linkedCatalog.providerId;

      if (warmCatalog) {
        this.warmSeriesEpisodeCatalog(linkedCatalog);
      }
      return;
    }

    target.episodeCatalogSource = null;
    target.episodeCatalogSourceId = null;
  }

  normalizeIdList(ids: readonly string[] | undefined): string[] {
    return normalizeIdList(ids);
  }

  orderForEpisodeAssignment(
    items: MediaItem[],
    mode: 'filename-asc' | 'existing-episode' | 'as-provided',
  ): MediaItem[] {
    return orderForEpisodeAssignment(items, mode);
  }

  private warmSeriesEpisodeCatalog(link: EpisodeCatalogLink): void {
    if (link.source === 'jikan') {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(link.providerId);
      return;
    }

    this.tmdbMetadataService.warmSeriesEpisodeCatalog(link.providerId);
  }

  private async loadSeriesEpisodeCatalog(
    link: EpisodeCatalogLink,
  ): Promise<NormalizedSeriesEpisodeCatalog | null> {
    try {
      if (link.source === 'jikan') {
        const catalog = await this.jikanMetadataService.getSeriesEpisodeCatalog(
          link.providerId,
        );
        if (!catalog || catalog.episodes.length === 0) {
          return null;
        }

        return {
          source: 'jikan',
          providerId: catalog.providerId,
          totalEpisodeCount: catalog.totalEpisodeCount,
          episodes: catalog.episodes.map((episode) => ({
            seasonNumber: 1,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            synopsis: episode.synopsis,
            airedAt: episode.airedAt,
          })),
          updatedAt: catalog.updatedAt,
        };
      }

      const catalog = await this.tmdbMetadataService.getSeriesEpisodeCatalog(
        link.providerId,
      );
      if (!catalog || catalog.episodes.length === 0) {
        return null;
      }

      return {
        source: 'tmdb',
        providerId: catalog.providerId,
        totalEpisodeCount: catalog.totalEpisodeCount,
        episodes: catalog.episodes.map((episode) => ({
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          synopsis: episode.synopsis,
          airedAt: episode.airedAt,
        })),
        updatedAt: catalog.updatedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Series episode catalog load failed for ${link.source}:${link.providerId}: ${message}`,
      );
      return null;
    }
  }
}
