import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import type { MediaMetadataPatch } from './metadata-update/media-metadata-patch.types';
import type { BulkAssignEpisodesInput } from './media.service.types';
import {
  updateMediaValue,
  type MediaMetadataOpsContext,
} from './media-service-metadata.helper';

export async function bulkAssignEpisodesValue(
  context: MediaMetadataOpsContext,
  input: BulkAssignEpisodesInput,
): Promise<{ updatedCount: number; items: MediaItem[] }> {
  const ids = context.mediaEpisodeCatalogService.normalizeIdList(
    input.mediaIds,
  );
  if (ids.length === 0) {
    throw new BadRequestException('At least one mediaId is required.');
  }

  const title = input.title?.trim();
  if (!title) {
    throw new BadRequestException('Title is required.');
  }

  const found = new Map<string, MediaItem>();
  for (const id of ids) {
    const item = await context.mediaStore.findById(id);
    if (!item) {
      throw new NotFoundException(`Media item not found: ${id}`);
    }
    found.set(id, item);
  }

  const ordered = context.mediaEpisodeCatalogService.orderForEpisodeAssignment(
    ids.map((id) => found.get(id)!),
    input.episodeOrder ?? 'filename-asc',
  );

  const type = input.type ?? 'show';
  const startEpisode =
    typeof input.startEpisodeNumber === 'number' && input.startEpisodeNumber > 0
      ? Math.floor(input.startEpisodeNumber)
      : 1;
  const seasonNumber =
    typeof input.seasonNumber === 'number' &&
    Number.isFinite(input.seasonNumber)
      ? Math.max(-1, Math.floor(input.seasonNumber))
      : type === 'show'
        ? 1
        : null;
  const releaseYear =
    typeof input.releaseYear === 'number' && Number.isFinite(input.releaseYear)
      ? Math.floor(input.releaseYear)
      : undefined;

  const tags = Array.isArray(input.tags) ? input.tags : undefined;
  const hasSeriesAssignmentRules = Object.prototype.hasOwnProperty.call(
    input,
    'seriesAssignmentRules',
  );
  const seriesAssignmentRules =
    context.mediaMetadataPatchApplicationService.normalizeSeriesAssignmentRules(
      input.seriesAssignmentRules,
    );

  const updates: MediaItem[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const patch: MediaMetadataPatch = {
      title,
      type,
      seasonNumber,
      episodeNumber: type === 'show' ? startEpisode + index : null,
    };
    if (releaseYear !== undefined) {
      patch.releaseYear = releaseYear;
    }
    if (tags !== undefined) {
      patch.tags = tags;
    }
    if (hasSeriesAssignmentRules) {
      patch.seriesAssignmentRules = seriesAssignmentRules;
    }

    const update = await updateMediaValue(context, ordered[index].id, patch);
    updates.push(update);
  }

  return {
    updatedCount: updates.length,
    items: updates,
  };
}
