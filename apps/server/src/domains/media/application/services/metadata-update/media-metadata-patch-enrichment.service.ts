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

type RemoteMediaProvider = 'tmdb' | 'jikan';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

interface RemoteSelectionRef {
  provider: RemoteMediaProvider;
  providerId: string;
}

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
  private readonly logger = new Logger(MediaMetadataPatchEnrichmentService.name);

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

    const previousSelection = this.resolveRemoteSelectionFromItem(existing);
    const nextSelection = this.resolveRemoteSelectionAfterPatch(
      existing,
      patch,
    );
    const remoteSelectionChanged = !this.remoteSelectionsEqual(
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

    const mediaTypeHint = this.resolveMediaTypeHintAfterPatch(existing, patch);
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
      this.hasNonEmptyString(remoteCandidate.posterUrl)
    ) {
      effectivePatch.posterUrl = remoteCandidate.posterUrl;
    }

    if (
      !this.hasPatchKey(effectivePatch, 'backdropUrl') &&
      this.hasNonEmptyString(remoteCandidate.backdropUrl)
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
      this.shouldHydrateDescriptionFromRemote(existing, patch) &&
      this.hasNonEmptyString(remoteCandidate.overview)
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
    const nextType = this.resolveMediaTypeHintAfterPatch(
      existing,
      effectivePatch,
    );
    if (nextType !== 'show') {
      return;
    }

    const nextSelection = this.resolveRemoteSelectionAfterPatch(
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
      ? this.coercePositiveEpisodeNumber(effectivePatch.episodeNumber ?? null)
      : this.coercePositiveEpisodeNumber(existing.episodeNumber);
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

    const incomingEpisodeTitle = this.normalizeOptionalString(
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

    const episodeSynopsis = this.normalizeOptionalString(
      episodeDetails.synopsis,
    );
    if (!episodeSynopsis) {
      return;
    }

    const incomingDescription = this.normalizeOptionalString(
      this.hasPatchKey(originalPatch, 'description')
        ? (originalPatch.description ?? null)
        : null,
    );
    const remoteOverview = this.normalizeOptionalString(
      remoteCandidate?.overview ?? null,
    );

    const shouldReplaceDescription =
      remoteSelectionChanged ||
      this.hasPatchKey(originalPatch, 'episodeNumber') ||
      this.hasPatchKey(originalPatch, 'seasonNumber') ||
      !this.hasPatchKey(originalPatch, 'description') ||
      !incomingDescription ||
      this.shouldHydrateDescriptionFromRemote(existing, originalPatch) ||
      (!!remoteOverview && incomingDescription === remoteOverview);

    if (shouldReplaceDescription) {
      effectivePatch.description = episodeSynopsis;
    }
  }

  private resolveRemoteSelectionFromItem(
    item: MediaItem,
  ): RemoteSelectionRef | null {
    const remoteSourceId = this.normalizeOptionalString(item.remoteSourceId);

    if (
      (item.remoteSource !== 'tmdb' && item.remoteSource !== 'jikan') ||
      !remoteSourceId
    ) {
      return null;
    }

    return {
      provider: item.remoteSource,
      providerId: remoteSourceId,
    };
  }

  private resolveRemoteSelectionAfterPatch(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): RemoteSelectionRef | null {
    const nextSource = this.hasPatchKey(patch, 'remoteSource')
      ? (patch.remoteSource ?? null)
      : (existing.remoteSource ?? null);
    const nextId = this.hasPatchKey(patch, 'remoteSourceId')
      ? this.normalizeOptionalString(patch.remoteSourceId)
      : this.normalizeOptionalString(existing.remoteSourceId);

    if ((nextSource !== 'tmdb' && nextSource !== 'jikan') || !nextId) {
      return null;
    }

    return {
      provider: nextSource,
      providerId: nextId,
    };
  }

  private remoteSelectionsEqual(
    left: RemoteSelectionRef | null,
    right: RemoteSelectionRef | null,
  ): boolean {
    if (!left || !right) {
      return left === right;
    }

    return (
      left.provider === right.provider && left.providerId === right.providerId
    );
  }

  private resolveMediaTypeHintAfterPatch(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): 'movie' | 'show' | null {
    const patchedType = this.hasPatchKey(patch, 'type')
      ? patch.type
      : existing.type;

    if (patchedType === 'movie' || patchedType === 'show') {
      return patchedType;
    }

    return existing.type === 'movie' || existing.type === 'show'
      ? existing.type
      : null;
  }

  private shouldHydrateDescriptionFromRemote(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): boolean {
    if (!this.hasPatchKey(patch, 'description')) {
      return true;
    }

    if (typeof patch.description !== 'string') {
      return false;
    }

    const incomingDescription = patch.description.trim();
    if (!incomingDescription) {
      return true;
    }

    const existingDescription =
      this.normalizeOptionalString(existing.description) ?? '';
    return incomingDescription === existingDescription;
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

  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }

  private hasNonEmptyString(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private coercePositiveEpisodeNumber(value: number | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : null;
  }
}
