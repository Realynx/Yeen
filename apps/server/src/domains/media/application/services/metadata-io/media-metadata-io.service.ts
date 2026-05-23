import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile as readFileBuffer,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { lookup } from 'mime-types';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaPathResolverService } from '../path-resolution/media-path-resolver.service';
import { MediaLibraryLocationsService } from '../library-locations/media-library-locations.service';

export interface MetadataExportImageAsset {
  mimeType: string;
  base64: string;
}

export interface MetadataImportPathContext {
  roots: string[];
  rootByLabel: Map<string, string>;
}

export interface ResolvedMediaLocationPath {
  absoluteFilePath: string;
  locationRoot: string;
  locationLabel: string;
  relativePathUnderLocation: string;
}

@Injectable()
export class MediaMetadataIoService {
  private readonly imageAssetPrefix = 'asset://';
  private readonly posterThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'posters',
  );
  private readonly backdropThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'backdrops',
  );

  constructor(
    private readonly mediaPathResolver: MediaPathResolverService,
    private readonly mediaLibraryLocationsService: MediaLibraryLocationsService,
  ) {}

  async createImportPathContext(): Promise<MetadataImportPathContext> {
    const roots = (await this.mediaLibraryLocationsService.resolveScanLocations()).map(
      (location) => resolve(location),
    );
    const rootByLabel = new Map<string, string>();

    for (const root of roots) {
      const label = basename(root).trim().toLowerCase();
      if (!label || rootByLabel.has(label)) {
        continue;
      }

      rootByLabel.set(label, root);
    }

    return {
      roots,
      rootByLabel,
    };
  }

  async toPortableExportItem(
    item: MediaItem,
    pathContext: MetadataImportPathContext,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<MediaItem> {
    const portableRelativePath = this.toPortableRelativePath(item, pathContext);
    const portableFilePath = portableRelativePath || basename(item.filePath);
    const previewImagePath = await this.exportImagePathAsAsset(
      item.previewImagePath,
      imageAssets,
    );
    const backdropImagePath = await this.exportImagePathAsAsset(
      item.backdropImagePath,
      imageAssets,
    );

    return {
      ...item,
      relativePath: portableRelativePath,
      filePath: portableFilePath,
      previewImagePath,
      backdropImagePath,
      // Chapter thumbnails are intentionally omitted from portable exports
      // because they are machine-local cache artifacts and can be regenerated.
      chapterThumbnails: [],
    };
  }

  async restorePortableImagePaths(
    item: MediaItem,
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<MediaItem> {
    const [previewImagePath, backdropImagePath] = await Promise.all([
      this.restorePortableImagePath(
        item.previewImagePath,
        'poster',
        imageAssets,
        restoredAssetPathById,
      ),
      this.restorePortableImagePath(
        item.backdropImagePath,
        'backdrop',
        imageAssets,
        restoredAssetPathById,
      ),
    ]);

    return {
      ...item,
      previewImagePath,
      backdropImagePath,
    };
  }

  normalizeImportedRelativePath(value: string): string {
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

  async resolveImportedFilePathWithinLocations(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): Promise<ResolvedMediaLocationPath> {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    for (const candidate of candidates) {
      if (!(await this.fileExists(candidate))) {
        continue;
      }

      const matchedLocation = this.matchPathToMediaLocation(candidate, context);
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    const fuzzyResolved = await this.mediaPathResolver.resolveRelativePathFuzzy(
      relativePath,
      context,
    );
    if (fuzzyResolved) {
      const matchedLocation = this.matchPathToMediaLocation(
        fuzzyResolved,
        context,
      );
      if (matchedLocation) {
        return matchedLocation;
      }
    }

    throw new BadRequestException(
      'Imported media file does not exist in configured media locations.',
    );
  }

  rebaseImportedFilePath(
    importedFilePath: string,
    relativePath: string,
    context: MetadataImportPathContext,
  ): string {
    const candidates = this.mediaPathResolver.buildMediaFilePathCandidates(
      importedFilePath,
      relativePath,
      context,
    );

    if (candidates.length === 0) {
      throw new BadRequestException('Imported filePath cannot be empty.');
    }

    return candidates[0];
  }

  extractImportedItems(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (this.isObjectRecord(value) && Array.isArray(value['items'])) {
      return value['items'] as unknown[];
    }

    throw new BadRequestException(
      'Import file must contain an items array at the top level.',
    );
  }

  extractImportedImageAssets(
    value: unknown,
  ): Record<string, MetadataExportImageAsset> | null {
    if (
      !this.isObjectRecord(value) ||
      !this.isObjectRecord(value['imageAssets'])
    ) {
      return null;
    }

    const rawAssets = value['imageAssets'];
    const normalized: Record<string, MetadataExportImageAsset> = {};

    for (const [assetId, candidate] of Object.entries(rawAssets)) {
      if (!this.isObjectRecord(candidate)) {
        continue;
      }

      const mimeType =
        typeof candidate['mimeType'] === 'string'
          ? candidate['mimeType'].trim()
          : '';
      const base64 =
        typeof candidate['base64'] === 'string'
          ? candidate['base64'].trim()
          : '';

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

  readRequiredString(
    source: Record<string, unknown>,
    key: string,
    context: string,
  ): string {
    const value = this.readOptionalString(source, key);
    if (!value) {
      throw new BadRequestException(`Invalid or missing ${context}.${key}.`);
    }

    return value;
  }

  readOptionalString(
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

  readOptionalNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  readStringArray(source: Record<string, unknown>, key: string): string[] {
    const value = source[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  normalizeImportedType(value: string | null): 'movie' | 'show' | 'other' {
    if (value === 'movie' || value === 'show' || value === 'other') {
      return value;
    }

    return 'other';
  }

  normalizeDigitalMediaType(
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

  normalizeRemoteSource(value: string | null): 'tmdb' | 'jikan' | undefined {
    if (value === 'tmdb' || value === 'jikan') {
      return value;
    }

    return undefined;
  }

  normalizeImportedSubtitleDetails(value: unknown): MediaItem['subtitleDetails'] {
    if (!Array.isArray(value)) {
      return [];
    }

    const out: MediaItem['subtitleDetails'] = [];
    for (const entry of value) {
      if (!this.isObjectRecord(entry)) {
        continue;
      }

      const kind = entry['kind'];
      if (kind !== 'embedded' && kind !== 'external') {
        continue;
      }

      const label = this.readOptionalString(entry, 'label') ?? '';
      const source = this.readOptionalString(entry, 'source') ?? '';
      if (!label || !source) {
        continue;
      }

      out.push({
        kind,
        label,
        language: this.readOptionalString(entry, 'language'),
        source,
      });
    }

    return out;
  }

  normalizeImportedChapterThumbnails(
    value: unknown,
  ): MediaItem['chapterThumbnails'] {
    if (!Array.isArray(value)) {
      return [];
    }

    const out: MediaItem['chapterThumbnails'] = [];
    for (const entry of value) {
      if (!this.isObjectRecord(entry)) {
        continue;
      }

      const imagePath = this.readOptionalString(entry, 'imagePath') ?? '';
      const second = this.readOptionalNumber(entry, 'second');
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

  normalizeImportedMediaDetails(value: unknown): MediaItem['mediaDetails'] {
    if (!this.isObjectRecord(value)) {
      return {
        formatName: null,
        bitRate: null,
        frameRate: null,
        audioChannels: null,
      };
    }

    return {
      formatName: this.readOptionalString(value, 'formatName'),
      bitRate: this.toNullableNumber(this.readOptionalNumber(value, 'bitRate')),
      frameRate: this.toNullableNumber(
        this.readOptionalNumber(value, 'frameRate'),
      ),
      audioChannels: this.toNullableNumber(
        this.readOptionalNumber(value, 'audioChannels'),
      ),
    };
  }

  toNullableNumber(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  toNonNegativeNumber(value: number | null, fallback = 0): number {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return value;
  }

  toNonNegativeInteger(value: number | null, fallback = 0): number {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return Math.floor(value);
  }

  toNonNegativeNullableInteger(value: number | null): number | null {
    if (value === null || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.floor(value);
  }

  normalizeImportedTimestamp(value: string | null, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return new Date(parsed).toISOString();
  }

  private toPortableRelativePath(
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

    const fallbackRelative = this.normalizeImportedRelativePath(
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

  private async exportImagePathAsAsset(
    imagePath: string | null,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<string | null> {
    if (!imagePath) {
      return null;
    }

    const trimmed = imagePath.trim();
    if (!trimmed) {
      return null;
    }

    if (this.isRemoteUrl(trimmed)) {
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

    return `${this.imageAssetPrefix}${assetId}`;
  }

  private async restorePortableImagePath(
    imagePath: string | null,
    variant: 'poster' | 'backdrop',
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<string | null> {
    if (!imagePath) {
      return null;
    }

    const trimmed = imagePath.trim();
    if (!trimmed) {
      return null;
    }

    if (this.isRemoteUrl(trimmed)) {
      return trimmed;
    }

    if (!trimmed.startsWith(this.imageAssetPrefix)) {
      return this.looksWindowsAbsolutePath(trimmed) ? null : trimmed;
    }

    const assetId = trimmed.slice(this.imageAssetPrefix.length).trim();
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

    const restoredPath = await this.writeImportedImageAsset(
      assetId,
      asset,
      variant,
    );

    if (restoredPath) {
      restoredAssetPathById.set(assetId, restoredPath);
    }

    return restoredPath;
  }

  private async writeImportedImageAsset(
    assetId: string,
    asset: MetadataExportImageAsset,
    variant: 'poster' | 'backdrop',
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

    const extension = this.imageExtensionFromMime(asset.mimeType);
    const targetDirectory =
      variant === 'poster'
        ? this.posterThumbnailDir
        : this.backdropThumbnailDir;
    const outputPath = join(targetDirectory, `${assetId}${extension}`);

    try {
      await mkdir(targetDirectory, { recursive: true });
      await writeFile(outputPath, payload);
      return outputPath;
    } catch {
      return null;
    }
  }

  private imageExtensionFromMime(mimeType: string): string {
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

  private looksWindowsAbsolutePath(value: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private matchPathToMediaLocation(
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

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
}
