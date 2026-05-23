import { Injectable, Logger } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import { JikanMetadataService } from '../remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from '../remote-metadata/tmdb-metadata.service';

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

interface EpisodeCatalogLink {
  source: 'jikan' | 'tmdb';
  providerId: string;
}

interface NormalizedSeriesCatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string | null;
}

interface NormalizedSeriesEpisodeCatalog {
  source: 'jikan' | 'tmdb';
  providerId: string;
  totalEpisodeCount: number;
  episodes: NormalizedSeriesCatalogEpisode[];
  updatedAt: string;
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

    const catalogLink = this.resolveEpisodeCatalogLink(current);
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
      const sourceLabel = this.remoteSourceLabel(catalogLink.source);
      return {
        status: 'unavailable',
        reason: `Episode catalog could not be loaded from ${sourceLabel} for this series.`,
        source: null,
      };
    }

    const allItems = await this.mediaStore.all();
    const seriesItems = this.collectSeriesItemsForEpisodeTracker(
      allItems,
      current,
      catalogLink,
    );

    const seasonNumbers = new Set<number>();
    const localEpisodesBySeason = new Map<number, Set<number>>();

    for (const item of seriesItems) {
      if (item.type !== 'show') {
        continue;
      }

      const episode = this.coercePositiveEpisodeNumber(item.episodeNumber);
      if (!episode) {
        continue;
      }

      const season = this.coerceSeasonForTracker(item.seasonNumber);
      seasonNumbers.add(season);

      const existingSeasonEpisodes =
        localEpisodesBySeason.get(season) ?? new Set<number>();
      existingSeasonEpisodes.add(episode);
      localEpisodesBySeason.set(season, existingSeasonEpisodes);
    }

    const seasonsSeen = [...seasonNumbers].sort((left, right) => left - right);
    const expectedSeasons = [
      ...new Set(catalog.episodes.map((episode) => episode.seasonNumber)),
    ].sort((left, right) => left - right);
    const preferredSeasonNumber = this.coerceSeasonForTracker(
      current.seasonNumber,
    );
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
    const sourceLabel = this.remoteSourceLabel(catalog.source);

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
      note:
        expectedSeasons.length > 1
          ? `Multiple seasons are tracked against the linked ${sourceLabel} episode catalog.`
          : extraSeasons.length > 0
            ? `Local episodes include seasons outside the linked ${sourceLabel} catalog.`
            : null,
    };
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

    let linkedCatalog = this.resolveEpisodeCatalogLink(target);

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
      const linkedProviderId = this.normalizeOptionalString(
        target.remoteSourceId,
      );
      linkedCatalog = linkedProviderId
        ? {
            source: target.remoteSource,
            providerId: linkedProviderId,
          }
        : null;
    } else if (target.remoteSource) {
      linkedCatalog = null;
    } else if (!linkedCatalog && previous) {
      linkedCatalog = this.resolveEpisodeCatalogLink(previous);
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
    if (!Array.isArray(ids)) {
      return [];
    }

    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string') {
        continue;
      }

      const cleaned = id.trim();
      if (!cleaned || seen.has(cleaned)) {
        continue;
      }

      seen.add(cleaned);
      normalized.push(cleaned);
    }

    return normalized;
  }

  orderForEpisodeAssignment(
    items: MediaItem[],
    mode: 'filename-asc' | 'existing-episode' | 'as-provided',
  ): MediaItem[] {
    if (mode === 'as-provided') {
      return [...items];
    }

    if (mode === 'existing-episode') {
      return [...items].sort((left, right) => {
        const leftSeason = left.seasonNumber ?? Number.MAX_SAFE_INTEGER;
        const rightSeason = right.seasonNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftSeason !== rightSeason) {
          return leftSeason - rightSeason;
        }

        const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
        const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftEpisode !== rightEpisode) {
          return leftEpisode - rightEpisode;
        }

        return left.relativePath.localeCompare(right.relativePath, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
    }

    return [...items].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }

  private warmSeriesEpisodeCatalog(link: EpisodeCatalogLink): void {
    if (link.source === 'jikan') {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(link.providerId);
      return;
    }

    this.tmdbMetadataService.warmSeriesEpisodeCatalog(link.providerId);
  }

  private resolveEpisodeCatalogLink(item: MediaItem): EpisodeCatalogLink | null {
    const linkedSource = this.normalizeEpisodeCatalogSource(
      this.normalizeOptionalString(item.episodeCatalogSource),
    );
    const linkedId = this.normalizeOptionalString(item.episodeCatalogSourceId);

    if (linkedSource && linkedId) {
      return {
        source: linkedSource,
        providerId: linkedId,
      };
    }

    if (item.remoteSource === 'tmdb' || item.remoteSource === 'jikan') {
      const remoteSourceId = this.normalizeOptionalString(item.remoteSourceId);
      if (remoteSourceId) {
        return {
          source: item.remoteSource,
          providerId: remoteSourceId,
        };
      }
    }

    return null;
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

  private episodeCatalogLinksEqual(
    left: EpisodeCatalogLink | null,
    right: EpisodeCatalogLink | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return left.source === right.source && left.providerId === right.providerId;
  }

  private collectSeriesItemsForEpisodeTracker(
    items: MediaItem[],
    current: MediaItem,
    catalogLink: EpisodeCatalogLink,
  ): MediaItem[] {
    const byLinkedSource = items.filter(
      (item) =>
        item.type === 'show' &&
        this.episodeCatalogLinksEqual(
          this.resolveEpisodeCatalogLink(item),
          catalogLink,
        ),
    );

    if (byLinkedSource.length > 0) {
      return byLinkedSource;
    }

    const normalizedTitle = normalizeForKey(current.title);
    return items.filter(
      (item) =>
        item.type === 'show' && normalizeForKey(item.title) === normalizedTitle,
    );
  }

  private coercePositiveEpisodeNumber(value: number | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }

  private coerceSeasonForTracker(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 1;
    }

    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : 1;
  }

  private normalizeEpisodeCatalogSource(
    value: string | null,
  ): 'tmdb' | 'jikan' | null {
    return value === 'tmdb' || value === 'jikan' ? value : null;
  }

  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }

  private remoteSourceLabel(provider: 'tmdb' | 'jikan'): string {
    return provider === 'tmdb' ? 'TMDB' : 'Jikan';
  }
}
