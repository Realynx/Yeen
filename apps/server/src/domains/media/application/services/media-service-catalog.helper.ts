import { BadRequestException, Logger } from '@nestjs/common';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import type {
  BulkDeleteMediaResult,
  DeletedMediaItemResult,
  RemoteMediaProvider,
} from './media.service.types';

interface MediaPermanentDeleteLike {
  deleteMediaPermanently(mediaId: string): Promise<DeletedMediaItemResult>;
}

interface MediaEpisodeCatalogLike {
  normalizeIdList(ids: string[]): string[];
}

interface MediaRemoteCatalogLike {
  searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }): Promise<unknown>;
  searchRemoteMediaCatalog(input: {
    query: string;
    limit?: number;
    page?: number;
    providers?: RemoteMediaProvider[];
    tags?: string[];
    useCache?: boolean;
  }): Promise<{
    query: string;
    providers: RemoteMediaProvider[];
    total: number;
    page: number;
    hasMore: boolean;
    items: MediaItem[];
  }>;
  getRemoteMediaById(remoteId: string): Promise<MediaItem>;
}

export interface MediaCatalogOpsContext {
  mediaEpisodeCatalogService: MediaEpisodeCatalogLike;
  mediaPermanentDeleteService: MediaPermanentDeleteLike;
  mediaRemoteCatalogService: MediaRemoteCatalogLike;
  logger: Logger;
}

export async function bulkDeleteMediaPermanentlyValue(
  context: MediaCatalogOpsContext,
  mediaIds: string[],
): Promise<BulkDeleteMediaResult> {
  const ids = context.mediaEpisodeCatalogService.normalizeIdList(mediaIds);
  if (ids.length === 0) {
    throw new BadRequestException('At least one mediaId is required.');
  }

  const results: DeletedMediaItemResult[] = [];
  let deleted = 0;

  for (const mediaId of ids) {
    try {
      const result =
        await context.mediaPermanentDeleteService.deleteMediaPermanently(
          mediaId,
        );
      results.push(result);
      if (result.success) {
        deleted += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown delete error.';
      context.logger.warn(`Permanent delete failed for ${mediaId}: ${message}`);
      results.push({
        mediaId,
        title: mediaId,
        success: false,
        deletedEntries: 0,
        error: message,
      });
    }
  }

  return {
    requested: ids.length,
    deleted,
    failed: ids.length - deleted,
    results,
  };
}

export function searchMetadataCandidatesValue(
  context: MediaCatalogOpsContext,
  input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  },
) {
  return context.mediaRemoteCatalogService.searchMetadataCandidates(input);
}

export function searchRemoteMediaCatalogValue(
  context: MediaCatalogOpsContext,
  input: {
    query: string;
    limit?: number;
    page?: number;
    providers?: RemoteMediaProvider[];
    tags?: string[];
    useCache?: boolean;
  },
): Promise<{
  query: string;
  providers: RemoteMediaProvider[];
  total: number;
  page: number;
  hasMore: boolean;
  items: MediaItem[];
}> {
  return context.mediaRemoteCatalogService.searchRemoteMediaCatalog(input);
}

export function getRemoteMediaByIdValue(
  context: MediaCatalogOpsContext,
  remoteId: string,
): Promise<MediaItem> {
  return context.mediaRemoteCatalogService.getRemoteMediaById(remoteId);
}
