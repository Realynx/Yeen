import {
  MediaChapterThumbnail,
  MediaDetails,
  MediaItem,
  MediaSubtitleDetail,
} from '../../domain/entities/media-item.entity';
import { parseSeriesAssignmentRules } from './media-store-series-rules.helpers';

export interface MediaRow {
  id: string;
  title: string;
  normalized_title: string;
  tags_json: string;
  description: string | null;
  release_year: number | null;
  season_number: number | null;
  episode_number: number | null;
  episode_title: string | null;
  dedupe_key: string;
  relative_path: string;
  file_path: string;
  extension: string;
  container: string | null;
  type: 'movie' | 'show' | 'other';
  digital_media_type: 'video' | 'audio' | 'image' | 'other';
  size_bytes: number;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  subtitle_streams: number;
  subtitle_details_json: string;
  preview_image_path: string | null;
  backdrop_image_path: string | null;
  chapter_thumbnails_json: string;
  media_details_json: string;
  series_assignment_rules_json: string | null;
  episode_catalog_source: 'tmdb' | 'jikan' | null;
  episode_catalog_source_id: string | null;
  metadata_refreshed_at: string;
  updated_at: string;
}

export function mediaRowToItem(row: MediaRow): MediaItem {
  const chapterThumbnails = parseChapterThumbnails(row.chapter_thumbnails_json);

  return {
    id: row.id,
    title: row.title,
    normalizedTitle: row.normalized_title || normalizeTitle(row.title || ''),
    tags: parseTags(row.tags_json),
    description: row.description,
    releaseYear: toFiniteInteger(row.release_year),
    seasonNumber: toFiniteInteger(row.season_number),
    episodeNumber: toFiniteInteger(row.episode_number),
    episodeTitle: toNullableString(row.episode_title),
    dedupeKey: row.dedupe_key || buildDedupeKeyFromRow(row),
    relativePath: row.relative_path,
    filePath: row.file_path,
    extension: row.extension,
    container: row.container,
    type: row.type,
    digitalMediaType: row.digital_media_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    subtitleStreams: row.subtitle_streams,
    subtitleDetails: parseSubtitleDetails(row.subtitle_details_json),
    previewImagePath: row.preview_image_path,
    backdropImagePath:
      toNullableString(row.backdrop_image_path) ??
      chapterThumbnails[0]?.imagePath ??
      null,
    chapterThumbnails,
    mediaDetails: parseMediaDetails(row.media_details_json),
    seriesAssignmentRules: parseSeriesAssignmentRules(
      row.series_assignment_rules_json,
    ),
    episodeCatalogSource:
      row.episode_catalog_source === 'tmdb' ||
      row.episode_catalog_source === 'jikan'
        ? row.episode_catalog_source
        : null,
    episodeCatalogSourceId: toNullableString(row.episode_catalog_source_id),
    metadataRefreshedAt: row.metadata_refreshed_at || row.updated_at,
    updatedAt: row.updated_at,
  };
}

export function mediaItemToDbParams(item: MediaItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    normalized_title: item.normalizedTitle || normalizeTitle(item.title),
    tags_json: JSON.stringify(normalizeTags(item.tags)),
    description: item.description,
    release_year: item.releaseYear,
    season_number: item.seasonNumber,
    episode_number: item.episodeNumber,
    episode_title: item.episodeTitle,
    dedupe_key: item.dedupeKey || buildDedupeKey(item),
    relative_path: item.relativePath,
    file_path: item.filePath,
    extension: item.extension,
    container: item.container,
    type: item.type,
    digital_media_type: item.digitalMediaType,
    size_bytes: item.sizeBytes,
    duration_seconds: item.durationSeconds,
    width: item.width,
    height: item.height,
    video_codec: item.videoCodec,
    audio_codec: item.audioCodec,
    subtitle_streams: item.subtitleStreams,
    subtitle_details_json: JSON.stringify(item.subtitleDetails ?? []),
    preview_image_path: item.previewImagePath,
    backdrop_image_path: item.backdropImagePath,
    chapter_thumbnails_json: JSON.stringify(item.chapterThumbnails ?? []),
    media_details_json: JSON.stringify(
      item.mediaDetails ?? defaultMediaDetails(),
    ),
    series_assignment_rules_json: item.seriesAssignmentRules
      ? JSON.stringify(item.seriesAssignmentRules)
      : null,
    episode_catalog_source:
      item.episodeCatalogSource === 'tmdb' ||
      item.episodeCatalogSource === 'jikan'
        ? item.episodeCatalogSource
        : null,
    episode_catalog_source_id: toNullableString(item.episodeCatalogSourceId),
    metadata_refreshed_at: item.metadataRefreshedAt ?? item.updatedAt,
    updated_at: item.updatedAt,
  };
}

function parseSubtitleDetails(raw: string): MediaSubtitleDetail[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => {
        const kind = item.kind === 'external' ? 'external' : 'embedded';
        const label = typeof item.label === 'string' ? item.label : kind;
        const source = typeof item.source === 'string' ? item.source : '';
        const language =
          typeof item.language === 'string' && item.language.trim()
            ? item.language
            : null;

        return {
          kind,
          label,
          source,
          language,
        };
      });
  } catch {
    return [];
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const tags = parsed.filter(
      (entry): entry is string => typeof entry === 'string',
    );
    return normalizeTags(tags);
  } catch {
    return [];
  }
}

function parseChapterThumbnails(raw: string): MediaChapterThumbnail[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          Array.isArray(entry)
        ) {
          return null;
        }

        const value = entry as Record<string, unknown>;
        const imagePath =
          typeof value.imagePath === 'string' ? value.imagePath.trim() : '';
        const second =
          typeof value.second === 'number' && Number.isFinite(value.second)
            ? value.second
            : null;

        if (!imagePath || second === null) {
          return null;
        }

        return {
          imagePath,
          second,
        };
      })
      .filter((entry): entry is MediaChapterThumbnail => !!entry);
  } catch {
    return [];
  }
}

function parseMediaDetails(raw: string): MediaDetails {
  const fallback = defaultMediaDetails();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return fallback;
    }

    const details = parsed as Record<string, unknown>;
    return {
      formatName:
        typeof details.formatName === 'string' ? details.formatName : null,
      bitRate: toFiniteNumber(details.bitRate),
      frameRate: toFiniteNumber(details.frameRate),
      audioChannels: toFiniteNumber(details.audioChannels),
    };
  } catch {
    return fallback;
  }
}

function defaultMediaDetails(): MediaDetails {
  return {
    formatName: null,
    bitRate: null,
    frameRate: null,
    audioChannels: null,
  };
}

function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toFiniteInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildDedupeKey(item: {
  type: 'movie' | 'show' | 'other';
  normalizedTitle: string;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number;
}): string {
  const normalizedTitle = item.normalizedTitle || normalizeTitle('untitled');

  if (item.type === 'show') {
    return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
  }

  if (item.type === 'movie') {
    return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
  }

  const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
  return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
}

function buildDedupeKeyFromRow(row: MediaRow): string {
  return buildDedupeKey({
    type: row.type,
    normalizedTitle: row.normalized_title || normalizeTitle(row.title),
    releaseYear: toFiniteInteger(row.release_year),
    seasonNumber: toFiniteInteger(row.season_number),
    episodeNumber: toFiniteInteger(row.episode_number),
    durationSeconds: row.duration_seconds,
  });
}
