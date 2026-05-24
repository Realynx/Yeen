import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  mkdir,
  readFile as readFileBuffer,
  writeFile,
} from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lookup } from 'mime-types';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import type {
  MetadataExportImageAsset,
  MetadataImportPathContext,
  ResolvedMediaLocationPath,
} from './media-metadata-io.service';

export async function exportImagePathAsAssetValue(
  imagePath: string | null,
  imageAssetPrefix: string,
  imageAssets: Record<string, MetadataExportImageAsset>,
): Promise<string | null> {
  if (!imagePath) {
    return null;
  }

  const trimmed = imagePath.trim();
  if (!trimmed) {
    return null;
  }

  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  const resolvedPath = resolve(trimmed);
  let payload: Buffer;

  try {
    payload = await readFileBuffer(resolvedPath);
  } catch {
    return null;
  }

  if (payload.length === 0) {
    return null;
  }

  const assetId = createHash('sha1').update(payload).digest('hex');
  if (!imageAssets[assetId]) {
    const lookedUpMimeType = lookup(resolvedPath);
    imageAssets[assetId] = {
      mimeType:
        typeof lookedUpMimeType === 'string'
          ? lookedUpMimeType
          : 'application/octet-stream',
      base64: payload.toString('base64'),
    };
  }

  return `${imageAssetPrefix}${assetId}`;
}

export async function restorePortableImagePathValue(
  imagePath: string | null,
  variant: 'poster' | 'backdrop',
  imageAssets: Record<string, MetadataExportImageAsset> | null,
  restoredAssetPathById: Map<string, string>,
  options: {
    imageAssetPrefix: string;
    posterThumbnailDir: string;
    backdropThumbnailDir: string;
  },
): Promise<string | null> {
  if (!imagePath) {
    return null;
  }

  const trimmed = imagePath.trim();
  if (!trimmed) {
    return null;
  }

  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  if (!trimmed.startsWith(options.imageAssetPrefix)) {
    return looksWindowsAbsolutePath(trimmed) ? null : trimmed;
  }

  const assetId = trimmed.slice(options.imageAssetPrefix.length).trim();
  if (!assetId || !imageAssets) {
    return null;
  }

  const cachedPath = restoredAssetPathById.get(assetId);
  if (cachedPath) {
    return cachedPath;
  }

  const asset = imageAssets[assetId];
  if (!asset) {
    return null;
  }

  const restoredPath = await writeImportedImageAssetValue(
    assetId,
    asset,
    variant,
    options,
  );

  if (restoredPath) {
    restoredAssetPathById.set(assetId, restoredPath);
  }

  return restoredPath;
}

export function toPortableRelativePathValue(
  item: MediaItem,
  context: MetadataImportPathContext,
): string {
  const rootsByLength = [...context.roots].sort(
    (left, right) => right.length - left.length,
  );
  const trimmedFilePath = item.filePath?.trim() ?? '';

  if (trimmedFilePath && isAbsolute(trimmedFilePath)) {
    const absolutePath = resolve(trimmedFilePath);

    for (const root of rootsByLength) {
      const rel = relative(root, absolutePath);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
        continue;
      }

      return rel.split(sep).join('/');
    }
  }

  const fallbackRelative = normalizeImportedRelativePathValue(
    item.relativePath || basename(trimmedFilePath),
  );
  const segments = fallbackRelative.split('/').filter(Boolean);

  if (
    segments.length > 1 &&
    context.rootByLabel.has(segments[0].toLowerCase())
  ) {
    return segments.slice(1).join('/');
  }

  return fallbackRelative;
}

export function matchPathToMediaLocationValue(
  filePath: string,
  context: MetadataImportPathContext,
): ResolvedMediaLocationPath | null {
  const absoluteFilePath = resolve(filePath);
  const sortedRoots = [...context.roots].sort(
    (left, right) => right.length - left.length,
  );

  for (const root of sortedRoots) {
    const relativeToRoot = relative(root, absoluteFilePath);
    if (
      !relativeToRoot ||
      relativeToRoot.startsWith('..') ||
      isAbsolute(relativeToRoot)
    ) {
      continue;
    }

    const normalizedRelative = relativeToRoot.split(sep).join('/');
    const locationLabel = basename(root).trim() || root;

    return {
      absoluteFilePath,
      locationRoot: root,
      locationLabel,
      relativePathUnderLocation: normalizedRelative,
    };
  }

  return null;
}

async function writeImportedImageAssetValue(
  assetId: string,
  asset: MetadataExportImageAsset,
  variant: 'poster' | 'backdrop',
  options: {
    posterThumbnailDir: string;
    backdropThumbnailDir: string;
  },
): Promise<string | null> {
  if (!asset.base64 || typeof asset.base64 !== 'string') {
    return null;
  }

  let payload: Buffer;
  try {
    payload = Buffer.from(asset.base64, 'base64');
  } catch {
    return null;
  }

  if (payload.length === 0) {
    return null;
  }

  const extension = imageExtensionFromMimeValue(asset.mimeType);
  const targetDirectory =
    variant === 'poster'
      ? options.posterThumbnailDir
      : options.backdropThumbnailDir;
  const outputPath = join(targetDirectory, `${assetId}${extension}`);

  try {
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(outputPath, payload);
    return outputPath;
  } catch {
    return null;
  }
}

function normalizeImportedRelativePathValue(value: string): string {
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

function imageExtensionFromMimeValue(mimeType: string): string {
  const normalized = (mimeType || '').trim().toLowerCase();

  if (normalized.includes('png')) {
    return '.png';
  }

  if (normalized.includes('webp')) {
    return '.webp';
  }

  if (normalized.includes('gif')) {
    return '.gif';
  }

  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return '.jpg';
  }

  return '.jpg';
}

function looksWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
