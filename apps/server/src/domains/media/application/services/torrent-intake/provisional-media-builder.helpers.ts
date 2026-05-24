import { randomUUID } from 'node:crypto';
import { basename, extname, relative, sep } from 'node:path';
import {
  cleanTitle,
  normalizeForKey,
} from '../../../infrastructure/helpers/title-normalizer';
import { detectFromFilenameAndPath } from '../../../infrastructure/helpers/filename-metadata';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaProbeHint } from '../scanner/media-scanner.service';

/**
 * Build a provisional MediaItem from torrent file discovery results.
 * Used when indexing a new torrent — estimates metadata and prepares
 * the record for enrichment via remote catalog lookups.
 */
export function buildProvisionalTorrentMediaItemValue(input: {
  canonicalPath: string;
  libraryRoot: string;
  fileSizeBytes: number;
  fallbackTitle: string;
  probeHint?: MediaProbeHint;
  relativePathHint?: string;
  mediaTypeHint?: 'show' | 'other' | null;
  seasonNumberHint?: number | null;
  episodeNumberHint?: number | null;
  episodeTitleHint?: string | null;
}): MediaItem {
  const now = new Date().toISOString();
  const extension = extname(input.canonicalPath).toLowerCase();
  const hintedTitle = input.probeHint?.title?.trim() ?? '';
  const title =
    hintedTitle || cleanTitle(input.fallbackTitle) || input.fallbackTitle;
  const normalizedTitle = normalizeForKey(title);
  const relativePath = (
    input.relativePathHint || relative(input.libraryRoot, input.canonicalPath)
  )
    .split(sep)
    .join('/');
  const filenameDetection = detectFromFilenameAndPath(
    basename(input.canonicalPath, extname(input.canonicalPath)),
    relativePath,
  );
  const fallbackMediaType =
    input.mediaTypeHint === 'show' || input.mediaTypeHint === 'other'
      ? input.mediaTypeHint
      : filenameDetection.suggestedType;
  const mediaType =
    input.probeHint?.mediaType === 'movie' ||
    input.probeHint?.mediaType === 'show' ||
    input.probeHint?.mediaType === 'other'
      ? input.probeHint.mediaType
      : fallbackMediaType === 'show'
        ? 'show'
        : fallbackMediaType === 'other'
          ? 'other'
          : 'other';
  const releaseYear =
    typeof input.probeHint?.releaseYear === 'number' &&
    Number.isFinite(input.probeHint.releaseYear)
      ? Math.floor(input.probeHint.releaseYear)
      : null;
  const estimatedBitRate = estimateProvisionalBitRateValue(input.fileSizeBytes);
  const durationSeconds = estimateProvisionalDurationSecondsValue(
    input.fileSizeBytes,
    estimatedBitRate,
  );
  const tags = normalizeProvisionalTagsValue(input.probeHint?.tags);
  const seasonNumber =
    mediaType === 'show'
      ? (input.seasonNumberHint ?? filenameDetection.seasonNumber ?? null)
      : null;
  const episodeNumber =
    mediaType === 'show'
      ? (input.episodeNumberHint ?? filenameDetection.episodeNumber ?? null)
      : null;
  const episodeTitle =
    mediaType === 'show'
      ? (input.episodeTitleHint ?? filenameDetection.episodeTitle ?? null)
      : null;

  return {
    id: randomUUID(),
    title,
    normalizedTitle,
    tags,
    description: input.probeHint?.description?.trim() || null,
    releaseYear,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    dedupeKey: buildProvisionalDedupeKeyValue({
      mediaType,
      normalizedTitle,
      releaseYear,
      seasonNumber,
      episodeNumber,
      durationSeconds,
    }),
    relativePath,
    filePath: input.canonicalPath,
    extension,
    container: extension ? extension.slice(1) : null,
    type: mediaType,
    digitalMediaType: 'video',
    sizeBytes: input.fileSizeBytes,
    durationSeconds,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: null,
    backdropImagePath: null,
    chapterThumbnails: [],
    mediaDetails: {
      formatName: extension ? extension.slice(1) : null,
      bitRate: estimatedBitRate,
      frameRate: null,
      audioChannels: null,
    },
    metadataRefreshedAt: now,
    updatedAt: now,
  };
}

/**
 * Normalize and deduplicate tags, returning them in sorted order.
 */
export function normalizeProvisionalTagsValue(
  tags: string[] | undefined,
): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const value of tags) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, trimmed);
    }
  }

  return [...deduped.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Estimate bitrate based on file size. Used as a heuristic when
 * the actual media file hasn't been fully probed yet.
 */
export function estimateProvisionalBitRateValue(fileSizeBytes: number): number {
  const gib = fileSizeBytes / (1024 * 1024 * 1024);
  if (gib >= 10) {
    return 18_000_000;
  }
  if (gib >= 6) {
    return 14_000_000;
  }
  if (gib >= 3) {
    return 10_000_000;
  }
  if (gib >= 1.5) {
    return 7_000_000;
  }
  return 4_000_000;
}

/**
 * Estimate duration based on file size and bitrate.
 * Clamps result to a reasonable range (20 minutes - 6 hours).
 */
export function estimateProvisionalDurationSecondsValue(
  fileSizeBytes: number,
  bitRate: number,
): number {
  if (bitRate <= 0 || fileSizeBytes <= 0) {
    return 2 * 60 * 60;
  }

  const estimated = (fileSizeBytes * 8) / bitRate;
  if (!Number.isFinite(estimated) || estimated <= 0) {
    return 2 * 60 * 60;
  }

  return Math.max(20 * 60, Math.min(6 * 60 * 60, estimated));
}

/**
 * Build the deduplication key for a media item.
 * Used to determine if this is a duplicate of an already-indexed media.
 */
export function buildProvisionalDedupeKeyValue(input: {
  mediaType: 'movie' | 'show' | 'other';
  normalizedTitle: string;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number;
}): string {
  const safeTitle = input.normalizedTitle || 'untitled';

  if (input.mediaType === 'show') {
    return `show:${safeTitle}:s${input.seasonNumber ?? 0}:e${input.episodeNumber ?? 0}`;
  }

  if (input.mediaType === 'movie') {
    return `movie:${safeTitle}:y${input.releaseYear ?? 0}`;
  }

  const durationBucket = Math.max(0, Math.round(input.durationSeconds / 300));
  return `other:${safeTitle}:y${input.releaseYear ?? 0}:d${durationBucket}`;
}
