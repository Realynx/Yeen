import { Injectable } from '@nestjs/common';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import {
  JikanMetadataService,
  type JikanRemoteCandidate,
} from '../remote-metadata/jikan-metadata.service';
import {
  TmdbMetadataService,
  type TmdbRemoteCandidate,
} from '../remote-metadata/tmdb-metadata.service';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

type EpisodeCatalogLink = {
  source: 'jikan' | 'tmdb';
  providerId: string;
};

@Injectable()
export class MediaIndexedItemMergeService {
  constructor(
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
  ) {}

  mergeScannedIndexedItem(existing: MediaItem, scanned: MediaItem): MediaItem {
    const merged: MediaItem = {
      ...scanned,
      id: existing.id,
    };

    // Existing indexed metadata is authoritative. Scanner results should
    // refresh technical probe fields and fill missing metadata only.
    merged.title = this.hasNonEmptyString(existing.title)
      ? existing.title
      : scanned.title;
    merged.releaseYear = existing.releaseYear ?? scanned.releaseYear;
    merged.type = existing.type;
    merged.seasonNumber = existing.seasonNumber ?? scanned.seasonNumber;
    merged.episodeNumber = existing.episodeNumber ?? scanned.episodeNumber;
    merged.episodeTitle = this.hasNonEmptyString(existing.episodeTitle)
      ? existing.episodeTitle
      : scanned.episodeTitle;
    merged.tags = existing.tags.length > 0 ? existing.tags : scanned.tags;
    merged.description = this.hasNonEmptyString(existing.description)
      ? existing.description
      : scanned.description;
    merged.previewImagePath = this.hasNonEmptyString(existing.previewImagePath)
      ? existing.previewImagePath
      : scanned.previewImagePath;
    merged.backdropImagePath = this.hasNonEmptyString(
      existing.backdropImagePath,
    )
      ? existing.backdropImagePath
      : scanned.backdropImagePath;

    if (
      !this.hasNonEmptyString(scanned.container) &&
      this.hasNonEmptyString(existing.container)
    ) {
      merged.container = existing.container;
    }

    if (scanned.durationSeconds <= 0 && existing.durationSeconds > 0) {
      merged.durationSeconds = existing.durationSeconds;
    }

    if ((scanned.width ?? 0) <= 0 && (existing.width ?? 0) > 0) {
      merged.width = existing.width;
    }

    if ((scanned.height ?? 0) <= 0 && (existing.height ?? 0) > 0) {
      merged.height = existing.height;
    }

    if (
      !this.hasNonEmptyString(scanned.videoCodec) &&
      this.hasNonEmptyString(existing.videoCodec)
    ) {
      merged.videoCodec = existing.videoCodec;
    }

    if (
      !this.hasNonEmptyString(scanned.audioCodec) &&
      this.hasNonEmptyString(existing.audioCodec)
    ) {
      merged.audioCodec = existing.audioCodec;
    }

    if (
      (!Array.isArray(scanned.subtitleDetails) ||
        scanned.subtitleDetails.length === 0) &&
      Array.isArray(existing.subtitleDetails) &&
      existing.subtitleDetails.length > 0
    ) {
      merged.subtitleDetails = existing.subtitleDetails;
      merged.subtitleStreams = existing.subtitleStreams;
    }

    if (
      (!Array.isArray(scanned.chapterThumbnails) ||
        scanned.chapterThumbnails.length === 0) &&
      Array.isArray(existing.chapterThumbnails) &&
      existing.chapterThumbnails.length > 0
    ) {
      merged.chapterThumbnails = existing.chapterThumbnails;
    }

    merged.mediaDetails = {
      formatName:
        scanned.mediaDetails?.formatName ?? existing.mediaDetails.formatName,
      bitRate: scanned.mediaDetails?.bitRate ?? existing.mediaDetails.bitRate,
      frameRate:
        scanned.mediaDetails?.frameRate ?? existing.mediaDetails.frameRate,
      audioChannels:
        scanned.mediaDetails?.audioChannels ??
        existing.mediaDetails.audioChannels,
    };

    if (scanned.sizeBytes <= 0 && existing.sizeBytes > 0) {
      merged.sizeBytes = existing.sizeBytes;
    }

    if (existing.remoteSource && existing.remoteSourceId) {
      merged.remoteSource = existing.remoteSource;
      merged.remoteSourceId = existing.remoteSourceId;
      merged.remoteSourceLabel =
        existing.remoteSourceLabel ??
        this.remoteSourceLabel(existing.remoteSource);
    } else if (merged.remoteSource && merged.remoteSourceId) {
      merged.remoteSourceLabel = this.remoteSourceLabel(merged.remoteSource);
    } else {
      merged.remoteSource = undefined;
      merged.remoteSourceId = null;
      merged.remoteSourceLabel = null;
    }

    if (existing.seriesAssignmentRules) {
      merged.seriesAssignmentRules = existing.seriesAssignmentRules;
    } else {
      merged.seriesAssignmentRules = null;
    }

    this.reconcileEpisodeCatalogLink(merged, existing, null, false);

    if (merged.type === 'show' && merged.seasonNumber === null) {
      merged.seasonNumber = 1;
    }

    if (merged.type !== 'show') {
      merged.seasonNumber = null;
      merged.episodeNumber = null;
      merged.episodeTitle = null;
    }

    const normalizedTitle = this.hasNonEmptyString(merged.title)
      ? merged.title.trim()
      : scanned.title;
    merged.title = normalizedTitle;
    merged.tags = this.normalizeEditableTags(merged.tags);
    merged.normalizedTitle = normalizeForKey(merged.title);
    merged.dedupeKey = this.buildDedupeKey(merged);

    return merged;
  }

  private buildDedupeKey(item: MediaItem): string {
    if (item.type === 'show') {
      const season = item.seasonNumber ?? 1;
      const episode = item.episodeNumber ?? 1;
      return `show:${item.normalizedTitle}:s${season}:e${episode}`;
    }

    if (item.type === 'movie') {
      return `movie:${item.normalizedTitle}:y${item.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${item.normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  private normalizeEditableTags(tags: readonly string[]): string[] {
    const normalized = new Set<string>();

    for (const rawTag of tags) {
      if (typeof rawTag !== 'string') {
        continue;
      }

      const splitValues = rawTag.split(',');
      for (const splitValue of splitValues) {
        const cleaned = splitValue.trim();
        if (!cleaned) {
          continue;
        }

        normalized.add(cleaned);
      }
    }

    return [...normalized].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private remoteSourceLabel(provider: 'tmdb' | 'jikan'): string {
    return provider === 'tmdb' ? 'TMDB' : 'Jikan';
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

  private normalizeEpisodeCatalogSource(
    value: string | null,
  ): 'tmdb' | 'jikan' | null {
    return value === 'tmdb' || value === 'jikan' ? value : null;
  }

  private resolveEpisodeCatalogLink(
    item: MediaItem,
  ): EpisodeCatalogLink | null {
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

  private reconcileEpisodeCatalogLink(
    target: MediaItem,
    previous: MediaItem | null,
    remoteCandidate: RemoteMediaCandidate | null,
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

  private warmSeriesEpisodeCatalog(link: EpisodeCatalogLink): void {
    if (link.source === 'jikan') {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(link.providerId);
      return;
    }

    this.tmdbMetadataService.warmSeriesEpisodeCatalog(link.providerId);
  }

  private hasNonEmptyString(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
