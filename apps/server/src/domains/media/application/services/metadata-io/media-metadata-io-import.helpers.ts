import { BadRequestException } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MetadataExportImageAsset } from './media-metadata-io.service';

export function normalizeImportedRelativePathValue(value: string): string {
  const normalized = value
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();

  if (!normalized) {
    throw new BadRequestException('Imported relativePath cannot be empty.');
  }

  return normalized;
}

export function extractImportedItemsValue(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isObjectRecordValue(value) && Array.isArray(value['items'])) {
    return value['items'] as unknown[];
  }

  throw new BadRequestException(
    'Import file must contain an items array at the top level.',
  );
}

export function extractImportedImageAssetsValue(
  value: unknown,
): Record<string, MetadataExportImageAsset> | null {
  if (
    !isObjectRecordValue(value) ||
    !isObjectRecordValue(value['imageAssets'])
  ) {
    return null;
  }

  const rawAssets = value['imageAssets'];
  const normalized: Record<string, MetadataExportImageAsset> = {};

  for (const [assetId, candidate] of Object.entries(rawAssets)) {
    if (!isObjectRecordValue(candidate)) {
      continue;
    }

    const mimeType =
      typeof candidate['mimeType'] === 'string'
        ? candidate['mimeType'].trim()
        : '';
    const base64 =
      typeof candidate['base64'] === 'string' ? candidate['base64'].trim() : '';

    if (!assetId || !mimeType || !base64) {
      continue;
    }

    normalized[assetId] = {
      mimeType,
      base64,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function readRequiredStringValue(
  source: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = readOptionalStringValue(source, key);
  if (!value) {
    throw new BadRequestException(`Invalid or missing ${context}.${key}.`);
  }

  return value;
}

export function readOptionalStringValue(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

export function readOptionalNumberValue(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function readStringArrayValue(
  source: Record<string, unknown>,
  key: string,
): string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function isObjectRecordValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeImportedTypeValue(
  value: string | null,
): 'movie' | 'show' | 'other' {
  if (value === 'movie' || value === 'show' || value === 'other') {
    return value;
  }

  return 'other';
}

export function normalizeDigitalMediaTypeValue(
  value: string | null,
): 'video' | 'audio' | 'image' | 'other' {
  if (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'other'
  ) {
    return value;
  }

  return 'other';
}

export function normalizeRemoteSourceValue(
  value: string | null,
): 'tmdb' | 'jikan' | undefined {
  if (value === 'tmdb' || value === 'jikan') {
    return value;
  }

  return undefined;
}

export function normalizeImportedSubtitleDetailsValue(
  value: unknown,
): MediaItem['subtitleDetails'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: MediaItem['subtitleDetails'] = [];
  for (const entry of value) {
    if (!isObjectRecordValue(entry)) {
      continue;
    }

    const kind = entry['kind'];
    if (kind !== 'embedded' && kind !== 'external') {
      continue;
    }

    const label = readOptionalStringValue(entry, 'label') ?? '';
    const source = readOptionalStringValue(entry, 'source') ?? '';
    if (!label || !source) {
      continue;
    }

    out.push({
      kind,
      label,
      language: readOptionalStringValue(entry, 'language'),
      source,
    });
  }

  return out;
}

export function normalizeImportedChapterThumbnailsValue(
  value: unknown,
): MediaItem['chapterThumbnails'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: MediaItem['chapterThumbnails'] = [];
  for (const entry of value) {
    if (!isObjectRecordValue(entry)) {
      continue;
    }

    const imagePath = readOptionalStringValue(entry, 'imagePath') ?? '';
    const second = readOptionalNumberValue(entry, 'second');
    if (
      !imagePath ||
      second === null ||
      !Number.isFinite(second) ||
      second < 0
    ) {
      continue;
    }

    out.push({
      imagePath,
      second,
    });
  }

  return out;
}

export function normalizeImportedMediaDetailsValue(
  value: unknown,
): MediaItem['mediaDetails'] {
  if (!isObjectRecordValue(value)) {
    return {
      formatName: null,
      bitRate: null,
      frameRate: null,
      audioChannels: null,
    };
  }

  return {
    formatName: readOptionalStringValue(value, 'formatName'),
    bitRate: toNullableNumberValue(readOptionalNumberValue(value, 'bitRate')),
    frameRate: toNullableNumberValue(
      readOptionalNumberValue(value, 'frameRate'),
    ),
    audioChannels: toNullableNumberValue(
      readOptionalNumberValue(value, 'audioChannels'),
    ),
  };
}

export function toNullableNumberValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function toNonNegativeNumberValue(
  value: number | null,
  fallback = 0,
): number {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

export function toNonNegativeIntegerValue(
  value: number | null,
  fallback = 0,
): number {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

export function toNonNegativeNullableIntegerValue(
  value: number | null,
): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

export function normalizeImportedTimestampValue(
  value: string | null,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return new Date(parsed).toISOString();
}
