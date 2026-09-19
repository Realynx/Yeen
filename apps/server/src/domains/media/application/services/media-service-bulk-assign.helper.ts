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

  const found = await findRequiredMediaItems(context, ids);

  const ordered = context.mediaEpisodeCatalogService.orderForEpisodeAssignment(
    ids.map((id) => found.get(id)!),
    input.episodeOrder ?? 'filename-asc',
  );

  const type = input.type ?? 'show';
  const startEpisode = positiveIntegerOr(input.startEpisodeNumber, 1);
  const seasonNumber = resolveSeasonNumber(input.seasonNumber, type);
  const releaseYear = optionalInteger(input.releaseYear);

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
    const patch = buildEpisodePatch(
      title,
      type,
      seasonNumber,
      startEpisode + index,
    );
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

async function findRequiredMediaItems(
  context: MediaMetadataOpsContext,
  ids: string[],
): Promise<Map<string, MediaItem>> {
  const found = new Map<string, MediaItem>();
  for (const id of ids) {
    const item = await context.mediaStore.findById(id);
    if (!item) throw new NotFoundException(`Media item not found: ${id}`);
    found.set(id, item);
  }
  return found;
}

function positiveIntegerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : fallback;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : undefined;
}

function resolveSeasonNumber(
  value: unknown,
  type: MediaItem['type'],
): number | null {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) return Math.max(-1, parsed);
  return type === 'show' ? 1 : null;
}

function buildEpisodePatch(
  title: string,
  type: MediaItem['type'],
  seasonNumber: number | null,
  episodeNumber: number,
): MediaMetadataPatch {
  return {
    title,
    type,
    seasonNumber,
    episodeNumber: type === 'show' ? episodeNumber : null,
  };
}
