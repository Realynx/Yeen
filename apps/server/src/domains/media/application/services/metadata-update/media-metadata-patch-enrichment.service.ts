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

    this.hydrateRemoteCandidateFields(
      effectivePatch,
      existing,
      patch,
      remoteCandidate,
      remoteSelectionChanged,
    );

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

    const normalizedSeasonNumber = this.resolveSeasonNumber(
      existing,
      effectivePatch,
    );
    if (normalizedSeasonNumber === null) return;
    const episodeNumber = this.resolveEpisodeNumber(existing, effectivePatch);
    if (!episodeNumber) return;

    const catalog = await this.loadSeriesEpisodeCatalog({
      source: nextSelection.provider,
      providerId: nextSelection.providerId,
    });
    if (!catalog || catalog.episodes.length === 0) {
      return;
    }

    const episodeDetails = this.findEpisodeDetails(
      catalog,
      normalizedSeasonNumber,
      episodeNumber,
    );
    if (!episodeDetails) {
      return;
    }

    if (this.shouldReplaceEpisodeTitle(originalPatch, remoteSelectionChanged)) {
      effectivePatch.episodeTitle = episodeDetails.title;
    }

    const episodeSynopsis = normalizeOptionalString(episodeDetails.synopsis);
    if (!episodeSynopsis) {
      return;
    }

    if (
      this.shouldReplaceEpisodeDescription(
        existing,
        originalPatch,
        remoteCandidate,
        remoteSelectionChanged,
      )
    ) {
      effectivePatch.description = episodeSynopsis;
    }
  }

  private hydrateRemoteCandidateFields(
    effectivePatch: MediaMetadataPatch,
    existing: MediaItem,
    originalPatch: MediaMetadataPatch,
    candidate: RemoteMediaCandidate,
    selectionChanged: boolean,
  ): void {
    if (
      !this.hasPatchKey(effectivePatch, 'posterUrl') &&
      hasNonEmptyString(candidate.posterUrl)
    ) {
      effectivePatch.posterUrl = candidate.posterUrl;
    }
    if (
      !this.hasPatchKey(effectivePatch, 'backdropUrl') &&
      hasNonEmptyString(candidate.backdropUrl)
    ) {
      effectivePatch.backdropUrl = candidate.backdropUrl;
    }
    if (
      selectionChanged &&
      !this.hasPatchKey(effectivePatch, 'releaseYear') &&
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
    ) {
      effectivePatch.releaseYear = Math.floor(candidate.releaseYear);
    }
    if (
      selectionChanged &&
      shouldHydrateDescriptionFromRemote(existing, originalPatch) &&
      hasNonEmptyString(candidate.overview)
    ) {
      effectivePatch.description = candidate.overview;
    }
  }

  private resolveSeasonNumber(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): number | null {
    const value = this.hasPatchKey(patch, 'seasonNumber')
      ? (patch.seasonNumber ?? null)
      : existing.seasonNumber;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = Math.floor(value);
      return normalized < 0 ? null : normalized;
    }
    return 1;
  }

  private resolveEpisodeNumber(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): number | null {
    const value = this.hasPatchKey(patch, 'episodeNumber')
      ? (patch.episodeNumber ?? null)
      : existing.episodeNumber;
    return coercePositiveEpisodeNumber(value);
  }

  private findEpisodeDetails(
    catalog: NormalizedSeriesEpisodeCatalog,
    seasonNumber: number,
    episodeNumber: number,
  ): NormalizedSeriesCatalogEpisode | null {
    if (catalog.source === 'jikan') {
      return (
        catalog.episodes.find(
          (episode) => episode.episodeNumber === episodeNumber,
        ) ?? null
      );
    }
    if (seasonNumber < 1) return null;
    return (
      catalog.episodes.find(
        (episode) =>
          episode.seasonNumber === seasonNumber &&
          episode.episodeNumber === episodeNumber,
      ) ?? null
    );
  }

  private shouldReplaceEpisodeTitle(
    patch: MediaMetadataPatch,
    selectionChanged: boolean,
  ): boolean {
    const incoming = this.hasPatchKey(patch, 'episodeTitle')
      ? normalizeOptionalString(patch.episodeTitle ?? null)
      : null;
    return (
      selectionChanged ||
      this.hasPatchKey(patch, 'episodeNumber') ||
      this.hasPatchKey(patch, 'seasonNumber') ||
      !this.hasPatchKey(patch, 'episodeTitle') ||
      !incoming
    );
  }

  private shouldReplaceEpisodeDescription(
    existing: MediaItem,
    patch: MediaMetadataPatch,
    remoteCandidate: RemoteMediaCandidate | null,
    selectionChanged: boolean,
  ): boolean {
    const incoming = this.hasPatchKey(patch, 'description')
      ? normalizeOptionalString(patch.description ?? null)
      : null;
    const remoteOverview = normalizeOptionalString(
      remoteCandidate?.overview ?? null,
    );
    const episodeChanged =
      this.hasPatchKey(patch, 'episodeNumber') ||
      this.hasPatchKey(patch, 'seasonNumber');
    return (
      selectionChanged ||
      episodeChanged ||
      !this.hasPatchKey(patch, 'description') ||
      !incoming ||
      shouldHydrateDescriptionFromRemote(existing, patch) ||
      Boolean(remoteOverview && incoming === remoteOverview)
    );
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
