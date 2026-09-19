import { Injectable } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';

@Injectable()
export class MediaIndexRefreshPolicyService {
  shouldRefreshIndexedItem(item: MediaItem): boolean {
    if (this.looksLikeProvisionalExternalMetadata(item)) {
      return true;
    }

    // Audio libraries commonly contain valid tracks without tags or artwork.
    // Once ffprobe populated stream details, absence of optional album metadata
    // must not force the same track through every subsequent scan.
    if (item.libraryType === 'music') {
      return false;
    }

    if (
      !this.hasNonEmptyString(item.previewImagePath) &&
      !this.hasNonEmptyString(item.backdropImagePath)
    ) {
      return true;
    }

    return !this.hasMetadataEnrichment(item);
  }

  isMetadataRefreshOlderThan(item: MediaItem, minAgeMs: number): boolean {
    const refreshedAtMs = Date.parse(
      item.metadataRefreshedAt || item.updatedAt,
    );
    if (!Number.isFinite(refreshedAtMs)) {
      return true;
    }

    return Date.now() - refreshedAtMs >= minAgeMs;
  }

  looksLikeProvisionalExternalMetadata(item: MediaItem): boolean {
    const extensionContainer = item.extension.replace(/^\./, '').toLowerCase();
    const container = (item.container ?? '').trim().toLowerCase();
    const formatName = (item.mediaDetails.formatName ?? '')
      .trim()
      .toLowerCase();
    const hasStreamDetails =
      (item.width ?? 0) > 0 ||
      (item.height ?? 0) > 0 ||
      this.hasNonEmptyString(item.videoCodec) ||
      this.hasNonEmptyString(item.audioCodec) ||
      item.subtitleStreams > 0 ||
      item.chapterThumbnails.length > 0;

    if (hasStreamDetails) {
      return false;
    }

    return (
      Boolean(extensionContainer) &&
      container === extensionContainer &&
      (!formatName || formatName === extensionContainer)
    );
  }

  private hasMetadataEnrichment(item: MediaItem): boolean {
    return (
      item.tags.length > 0 ||
      this.hasNonEmptyString(item.description) ||
      this.hasNonEmptyString(item.previewImagePath) ||
      this.hasNonEmptyString(item.backdropImagePath) ||
      Boolean(item.remoteSource && item.remoteSourceId)
    );
  }

  private hasNonEmptyString(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
