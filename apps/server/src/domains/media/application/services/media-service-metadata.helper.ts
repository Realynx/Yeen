import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
import type {
  BulkAssignEpisodesInput,
  MediaMetadataExportPayload,
  MediaMetadataImportResult,
  MetadataExportImageAsset,
  MetadataImportMode,
  MetadataImportPathContext,
} from './media.service.types';

interface MediaStoreLike {
  all(): Promise<MediaItem[]>;
  upsert(item: MediaItem): Promise<void>;
  replaceAll(items: MediaItem[]): Promise<void>;
  findById(id: string): Promise<MediaItem | undefined>;
}

interface MediaMetadataIoLike {
  createImportPathContext(): Promise<MetadataImportPathContext>;
  toPortableExportItem(
    item: MediaItem,
    pathContext: MetadataImportPathContext,
    imageAssets: Record<string, MetadataExportImageAsset>,
  ): Promise<MediaItem>;
  resolveImportedFilePathWithinLocations(
    filePath: string,
    relativePath: string,
    pathContext: MetadataImportPathContext,
  ): Promise<{
    absoluteFilePath: string;
    locationLabel: string;
    relativePathUnderLocation: string;
  }>;
  restorePortableImagePaths(
    item: MediaItem,
    imageAssets: Record<string, MetadataExportImageAsset> | null,
    restoredAssetPathById: Map<string, string>,
  ): Promise<MediaItem>;
  extractImportedItems(parsed: unknown): unknown[];
  extractImportedImageAssets(
    parsed: unknown,
  ): Record<string, MetadataExportImageAsset> | null;
}

interface MediaMetadataImportNormalizerLike {
  normalizeImportedMediaItem(
    entry: unknown,
    index: number,
    importedAt: string,
    pathContext: MetadataImportPathContext,
  ): MediaItem;
}

interface MediaMetadataPatchApplicationLike {
  applyPatch(existing: MediaItem, patch: MediaMetadataPatch): MediaItem;
  normalizeSeriesAssignmentRules(
    value: BulkAssignEpisodesInput['seriesAssignmentRules'],
  ): BulkAssignEpisodesInput['seriesAssignmentRules'];
}

interface MediaMetadataPatchEnrichmentLike {
  enrichPatchForMetadataUpdate(
    existing: MediaItem,
    patch: MediaMetadataPatch,
  ): Promise<{
    effectivePatch: MediaMetadataPatch;
    remoteSelectionChanged: boolean;
    remoteCandidate: { posterUrl: string | null; backdropUrl: string | null } | null;
  }>;
}

interface MediaMetadataArtworkRefreshLike {
  rebuildArtworkForMetadataUpdate(input: {
    item: MediaItem;
    resolvedFilePath: string;
    preferredPosterUrl: string | null;
    preferredBackdropUrl: string | null;
    forceDownload: boolean;
    allowExistingFallback: boolean;
  }): Promise<{
    previewImagePath: string | null;
    backdropImagePath: string | null;
    chapterThumbnails: MediaItem['chapterThumbnails'];
  }>;
}

interface MediaEpisodeCatalogLike {
  reconcileEpisodeCatalogLink(
    updated: MediaItem,
    existing: MediaItem,
    remoteCandidate: unknown,
    isManualUpdate: boolean,
  ): void;
  normalizeIdList(ids: string[]): string[];
  orderForEpisodeAssignment(
    items: MediaItem[],
    order: NonNullable<BulkAssignEpisodesInput['episodeOrder']>,
  ): MediaItem[];
}

export interface MediaMetadataOpsContext {
  mediaStore: MediaStoreLike;
  mediaMetadataIoService: MediaMetadataIoLike;
  mediaMetadataImportNormalizerService: MediaMetadataImportNormalizerLike;
  mediaMetadataPatchApplicationService: MediaMetadataPatchApplicationLike;
  mediaMetadataPatchEnrichmentService: MediaMetadataPatchEnrichmentLike;
  mediaMetadataArtworkRefreshService: MediaMetadataArtworkRefreshLike;
  mediaEpisodeCatalogService: MediaEpisodeCatalogLike;
  resolveMediaFilePath(
    relativeOrAbsoluteFilePath: string,
    relativePath: string,
    providedContext?: MetadataImportPathContext,
  ): Promise<string>;
  getById(mediaId: string): Promise<MediaItem>;
}

export async function exportMetadataValue(
  context: MediaMetadataOpsContext,
): Promise<MediaMetadataExportPayload> {
  const items = await context.mediaStore.all();
  const pathContext = await context.mediaMetadataIoService.createImportPathContext();
  const imageAssets: Record<string, MetadataExportImageAsset> = {};
  const portableItems = await Promise.all(
    items.map((item) =>
      context.mediaMetadataIoService.toPortableExportItem(
        item,
        pathContext,
        imageAssets,
      ),
    ),
  );

  const assetCount = Object.keys(imageAssets).length;

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    itemCount: portableItems.length,
    items: portableItems,
    imageAssets: assetCount > 0 ? imageAssets : undefined,
  };
}

export async function importMetadataValue(
  context: MediaMetadataOpsContext,
  input: {
    mode?: MetadataImportMode;
    items: unknown[];
    imageAssets?: Record<string, MetadataExportImageAsset> | null;
  },
): Promise<MediaMetadataImportResult> {
  const mode: MetadataImportMode = input.mode === 'replace' ? 'replace' : 'upsert';
  const sourceItems = Array.isArray(input.items) ? input.items : [];

  if (sourceItems.length === 0 && mode !== 'replace') {
    throw new BadRequestException(
      'Import payload must include at least one metadata item.',
    );
  }

  const importedAt = new Date().toISOString();
  const pathContext = await context.mediaMetadataIoService.createImportPathContext();

  if (sourceItems.length > 0 && pathContext.roots.length === 0) {
    throw new BadRequestException(
      'Import requires at least one saved media location. Configure media locations first, then retry the import.',
    );
  }

  const normalizedItems = sourceItems.map((entry, index) =>
    context.mediaMetadataImportNormalizerService.normalizeImportedMediaItem(
      entry,
      index,
      importedAt,
      pathContext,
    ),
  );
  const { items, unresolvedPaths } = await resolveImportedItemsValue(
    context,
    normalizedItems,
    pathContext,
    input.imageAssets ?? null,
  );

  if (unresolvedPaths.length > 0) {
    const examples = unresolvedPaths.slice(0, 5).join(', ');
    throw new BadRequestException(
      `Unable to resolve ${unresolvedPaths.length} imported media path(s) inside configured media locations. Examples: ${examples}`,
    );
  }

  await persistImportedItemsValue(context, mode, items);

  const noun = items.length === 1 ? 'item' : 'items';

  return {
    mode,
    receivedItems: sourceItems.length,
    importedItems: items.length,
    message:
      mode === 'replace'
        ? `Imported ${items.length} metadata ${noun} and replaced existing index.`
        : `Imported ${items.length} metadata ${noun}. Existing entries were upserted by file path.`,
  };
}

export async function importMetadataFromJsonValue(
  context: MediaMetadataOpsContext,
  input: {
    mode?: MetadataImportMode;
    rawJson: string;
  },
): Promise<MediaMetadataImportResult> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.rawJson);
  } catch {
    throw new BadRequestException(
      'Import file is not valid JSON. Export a fresh metadata backup and try again.',
    );
  }

  return importMetadataValue(context, {
    mode: input.mode,
    items: context.mediaMetadataIoService.extractImportedItems(parsed),
    imageAssets: context.mediaMetadataIoService.extractImportedImageAssets(parsed),
  });
}

export async function updateMediaValue(
  context: MediaMetadataOpsContext,
  mediaId: string,
  patch: MediaMetadataPatch,
): Promise<MediaItem> {
  const existing = await context.getById(mediaId);
  const { effectivePatch, remoteSelectionChanged, remoteCandidate } =
    await context.mediaMetadataPatchEnrichmentService.enrichPatchForMetadataUpdate(
      existing,
      patch,
    );
  const updated = context.mediaMetadataPatchApplicationService.applyPatch(
    existing,
    effectivePatch,
  );
  context.mediaEpisodeCatalogService.reconcileEpisodeCatalogLink(
    updated,
    existing,
    remoteCandidate,
    true,
  );

  const posterPatchProvided = hasPatchKey(patch, 'posterUrl');
  const backdropPatchProvided = hasPatchKey(patch, 'backdropUrl');
  const shouldRebuildArtwork =
    remoteSelectionChanged || posterPatchProvided || backdropPatchProvided;

  if (shouldRebuildArtwork) {
    const preferredPosterUrl = normalizeOptionalString(
      hasPatchKey(effectivePatch, 'posterUrl')
        ? effectivePatch.posterUrl
        : (remoteCandidate?.posterUrl ?? null),
    );
    const preferredBackdropUrl = normalizeOptionalString(
      hasPatchKey(effectivePatch, 'backdropUrl')
        ? effectivePatch.backdropUrl
        : (remoteCandidate?.backdropUrl ?? null),
    );

    let resolvedArtworkFilePath = updated.filePath;
    try {
      resolvedArtworkFilePath = await context.resolveMediaFilePath(
        updated.filePath,
        updated.relativePath,
      );
    } catch {
      // Fall back to stored path when path mapping is unavailable.
    }

    const rebuiltArtwork =
      await context.mediaMetadataArtworkRefreshService.rebuildArtworkForMetadataUpdate(
        {
          item: updated,
          resolvedFilePath: resolvedArtworkFilePath,
          preferredPosterUrl,
          preferredBackdropUrl,
          forceDownload: true,
          allowExistingFallback: !remoteSelectionChanged,
        },
      );

    updated.previewImagePath = rebuiltArtwork.previewImagePath;
    updated.backdropImagePath = rebuiltArtwork.backdropImagePath;
    updated.chapterThumbnails = rebuiltArtwork.chapterThumbnails;
  }

  await context.mediaStore.upsert(updated);
  return updated;
}

async function resolveImportedItemsValue(
  context: MediaMetadataOpsContext,
  normalizedItems: MediaItem[],
  pathContext: MetadataImportPathContext,
  imageAssets: Record<string, MetadataExportImageAsset> | null,
): Promise<{ items: MediaItem[]; unresolvedPaths: string[] }> {
  const restoredAssetPathById = new Map<string, string>();
  const unresolvedPaths: string[] = [];
  const items: MediaItem[] = [];

  for (const item of normalizedItems) {
    let nextItem = item;

    try {
      const resolved =
        await context.mediaMetadataIoService.resolveImportedFilePathWithinLocations(
          item.filePath,
          item.relativePath,
          pathContext,
        );

      nextItem = {
        ...nextItem,
        filePath: resolved.absoluteFilePath,
        relativePath: `${resolved.locationLabel}/${resolved.relativePathUnderLocation}`,
        extension:
          (extname(resolved.absoluteFilePath) || nextItem.extension || '').toLowerCase() ||
          nextItem.extension,
      };
    } catch {
      unresolvedPaths.push(item.relativePath || item.filePath);
      continue;
    }

    const hydratedItem = await context.mediaMetadataIoService.restorePortableImagePaths(
      nextItem,
      imageAssets,
      restoredAssetPathById,
    );
    items.push(hydratedItem);
  }

  return { items, unresolvedPaths };
}

async function persistImportedItemsValue(
  context: MediaMetadataOpsContext,
  mode: MetadataImportMode,
  items: MediaItem[],
): Promise<void> {
  if (mode === 'replace') {
    await context.mediaStore.replaceAll(items);
    return;
  }

  for (const item of items) {
    await context.mediaStore.upsert(item);
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function hasPatchKey<K extends keyof MediaMetadataPatch>(
  patch: MediaMetadataPatch,
  key: K,
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}
