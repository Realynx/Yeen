import { Injectable, Logger } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaMetadataPatch } from './media-metadata-patch.types';
import {
  JikanMetadataService,
  type JikanRemoteCandidate,
} from '../remote-metadata/jikan-metadata.service';
import {
  TmdbMetadataService,
  type TmdbRemoteCandidate,
} from '../remote-metadata/tmdb-metadata.service';
import {
  coercePositiveEpisodeNumber,
  hasNonEmptyString,
  normalizeOptionalString,
  type RemoteMediaProvider,
  type RemoteSelectionRef,
  remoteSelectionsEqual,
  resolveMediaTypeHintAfterPatch,
  resolveRemoteSelectionAfterPatch,
  resolveRemoteSelectionFromItem,
  shouldHydrateDescriptionFromRemote,
} from './media-metadata-patch-enrichment-helpers';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

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

export interface MediaMetadataPatchEnrichmentResult {
  effectivePatch: MediaMetadataPatch;
  remoteSelectionChanged: boolean;
  remoteCandidate: RemoteMediaCandidate | null;
}

@Injectable()
export class MediaMetadataPatchEnrichmentService {
  private readonly logger = new Logger(
    MediaMetadataPatchEnrichmentService.name,
  );

  constructor(
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
  ) {}

  async enrichPatchForMetadataUpdate(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): Promise<MediaMetadataPatchEnrichmentResult> {
    const remoteSelectionResult = await this.enrichPatchFromRemoteSelection(
      existing,
      patch,
    );

    await this.enrichPatchFromEpisodeCatalogSelection(
      existing,
      patch,
      remoteSelectionResult.effectivePatch,
      remoteSelectionResult.remoteSelectionChanged,
      remoteSelectionResult.remoteCandidate,
    );

    return remoteSelectionResult;
  }

  private async enrichPatchFromRemoteSelection(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): Promise<MediaMetadataPatchEnrichmentResult> {
    const touchesRemoteSelection =
      this.hasPatchKey(patch, 'remoteSource') ||
      this.hasPatchKey(patch, 'remoteSourceId');

    const effectivePatch: MediaMetadataPatch = { ...patch };

    if (!touchesRemoteSelection) {
      return {
        effectivePatch,
        remoteSelectionChanged: false,
        remoteCandidate: null,
      };
    }

    const previousSelection = resolveRemoteSelectionFromItem(existing);
    const nextSelection = resolveRemoteSelectionAfterPatch(existing, patch);
    const remoteSelectionChanged = !remoteSelectionsEqual(
      previousSelection,
      nextSelection,
    );

    if (!nextSelection) {
      return {
        effectivePatch,
        remoteSelectionChanged,
        remoteCandidate: null,
      };
    }

    const mediaTypeHint = resolveMediaTypeHintAfterPatch(existing, patch);
    const remoteCandidate = await this.fetchRemoteCandidate(
      nextSelection.provider,
      nextSelection.providerId,
      mediaTypeHint,
    );

    if (!remoteCandidate) {
      return {
        effectivePatch,
        remoteSelectionChanged,
        remoteCandidate: null,
      };
    }

    if (
      !this.hasPatchKey(effectivePatch, 'posterUrl') &&
      hasNonEmptyString(remoteCandidate.posterUrl)
    ) {
      effectivePatch.posterUrl = remoteCandidate.posterUrl;
    }

    if (
      !this.hasPatchKey(effectivePatch, 'backdropUrl') &&
      hasNonEmptyString(remoteCandidate.backdropUrl)
    ) {
      effectivePatch.backdropUrl = remoteCandidate.backdropUrl;
    }

    if (
      remoteSelectionChanged &&
      !this.hasPatchKey(effectivePatch, 'releaseYear') &&
      typeof remoteCandidate.releaseYear === 'number' &&
      Number.isFinite(remoteCandidate.releaseYear)
    ) {
      effectivePatch.releaseYear = Math.floor(remoteCandidate.releaseYear);
    }

    if (
      remoteSelectionChanged &&
      shouldHydrateDescriptionFromRemote(existing, patch) &&
      hasNonEmptyString(remoteCandidate.overview)
    ) {
      effectivePatch.description = remoteCandidate.overview;
    }

    return {
      effectivePatch,
      remoteSelectionChanged,
      remoteCandidate,
    };
  }

  private async enrichPatchFromEpisodeCatalogSelection(
    existing: MediaItem,
    originalPatch: MediaMetadataPatch,
    effectivePatch: MediaMetadataPatch,
    remoteSelectionChanged: boolean,
    remoteCandidate: RemoteMediaCandidate | null,
  ): Promise<void> {
    const nextType = resolveMediaTypeHintAfterPatch(existing, effectivePatch);
    if (nextType !== 'show') {
      return;
    }

    const nextSelection = resolveRemoteSelectionAfterPatch(
      existing,
      effectivePatch,
    );
    if (
      !nextSelection ||
      (nextSelection.provider !== 'jikan' && nextSelection.provider !== 'tmdb')
    ) {
      return;
    }

    const seasonNumber = this.hasPatchKey(effectivePatch, 'seasonNumber')
      ? (effectivePatch.seasonNumber ?? null)
      : existing.seasonNumber;
    if (
      typeof seasonNumber === 'number' &&
      Number.isFinite(seasonNumber) &&
      Math.floor(seasonNumber) < 0
    ) {
      return;
    }

    const normalizedSeasonNumber =
      typeof seasonNumber === 'number' && Number.isFinite(seasonNumber)
        ? Math.floor(seasonNumber)
        : 1;

    const episodeNumber = this.hasPatchKey(effectivePatch, 'episodeNumber')
      ? coercePositiveEpisodeNumber(effectivePatch.episodeNumber ?? null)
      : coercePositiveEpisodeNumber(existing.episodeNumber);
    if (!episodeNumber) {
      return;
    }

    const catalog = await this.loadSeriesEpisodeCatalog({
      source: nextSelection.provider,
      providerId: nextSelection.providerId,
    });
    if (!catalog || catalog.episodes.length === 0) {
      return;
    }

    const episodeDetails =
      catalog.source === 'jikan'
        ? catalog.episodes.find(
            (episode) => episode.episodeNumber === episodeNumber,
          )
        : normalizedSeasonNumber < 1
          ? null
          : catalog.episodes.find(
              (episode) =>
                episode.seasonNumber === normalizedSeasonNumber &&
                episode.episodeNumber === episodeNumber,
            );
    if (!episodeDetails) {
      return;
    }

    const incomingEpisodeTitle = normalizeOptionalString(
      this.hasPatchKey(originalPatch, 'episodeTitle')
        ? (originalPatch.episodeTitle ?? null)
        : null,
    );

    const shouldReplaceEpisodeTitle =
      remoteSelectionChanged ||
      this.hasPatchKey(originalPatch, 'episodeNumber') ||
      this.hasPatchKey(originalPatch, 'seasonNumber') ||
      !this.hasPatchKey(originalPatch, 'episodeTitle') ||
      !incomingEpisodeTitle;

    if (shouldReplaceEpisodeTitle) {
      effectivePatch.episodeTitle = episodeDetails.title;
    }

    const episodeSynopsis = normalizeOptionalString(episodeDetails.synopsis);
    if (!episodeSynopsis) {
      return;
    }

    const incomingDescription = normalizeOptionalString(
      this.hasPatchKey(originalPatch, 'description')
        ? (originalPatch.description ?? null)
        : null,
    );
    const remoteOverview = normalizeOptionalString(
      remoteCandidate?.overview ?? null,
    );

    const shouldReplaceDescription =
      remoteSelectionChanged ||
      this.hasPatchKey(originalPatch, 'episodeNumber') ||
      this.hasPatchKey(originalPatch, 'seasonNumber') ||
      !this.hasPatchKey(originalPatch, 'description') ||
      !incomingDescription ||
      shouldHydrateDescriptionFromRemote(existing, originalPatch) ||
      (!!remoteOverview && incomingDescription === remoteOverview);

    if (shouldReplaceDescription) {
      effectivePatch.description = episodeSynopsis;
    }
  }

  private async fetchRemoteCandidate(
    provider: RemoteMediaProvider,
    providerId: string,
    mediaTypeHint: 'movie' | 'show' | null,
  ): Promise<RemoteMediaCandidate | null> {
    try {
      if (provider === 'tmdb') {
        if (mediaTypeHint) {
          return await this.tmdbMetadataService.getRemoteDetails({
            providerId,
            mediaType: mediaTypeHint,
          });
        }

        const movieCandidate = await this.tmdbMetadataService.getRemoteDetails({
          providerId,
          mediaType: 'movie',
        });
        if (movieCandidate) {
          return movieCandidate;
        }

        return await this.tmdbMetadataService.getRemoteDetails({
          providerId,
          mediaType: 'show',
        });
      }

      const candidate =
        await this.jikanMetadataService.getRemoteDetails(providerId);
      if (!candidate) {
        return null;
      }

      if (mediaTypeHint && candidate.mediaType !== mediaTypeHint) {
        return {
          ...candidate,
          mediaType: mediaTypeHint,
        };
      }

      return candidate;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Remote metadata hydration failed for ${provider}:${providerId}: ${message}`,
      );
      return null;
    }
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

  private hasPatchKey<K extends keyof MediaMetadataPatch>(
    patch: MediaMetadataPatch,
    key: K,
  ): boolean {
    return Object.prototype.hasOwnProperty.call(patch, key);
  }
}
