import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import type {
  MediaTorrentDownloadProgressItem,
  PlaybackAudioTrack,
} from './media.service.types';

interface MediaScanStoreLike {
  get(): { status: string };
  start(scanId: string, sourcePaths: string[]): unknown;
}

interface MediaFileResolutionLike {
  resolveScanLocations(
    libraryPath?: string,
    libraryPaths?: string[],
  ): Promise<string[]>;
}

interface MediaScanExecutionLike {
  runScan(scanId: string, sourcePaths: string[]): Promise<void>;
}

interface MediaPlaybackLike {
  getPlaybackAudioTracks(media: MediaItem): Promise<PlaybackAudioTrack[]>;
  getPlaybackPlan(media: MediaItem): Promise<unknown>;
  getTorrentDownloadProgressByMediaIds(
    mediaIds: string[],
  ): Promise<{ items: MediaTorrentDownloadProgressItem[] }>;
}

interface MediaImageStreamLike {
  streamPreviewImage(item: MediaItem, response: Response): Promise<void>;
  streamBackdropImage(item: MediaItem, response: Response): Promise<void>;
  streamChapterThumbnail(
    item: MediaItem,
    index: number,
    response: Response,
  ): Promise<void>;
}

export interface MediaPlaybackOpsContext {
  mediaScanStore: MediaScanStoreLike;
  mediaFileResolutionService: MediaFileResolutionLike;
  mediaScanExecutionService: MediaScanExecutionLike;
  mediaPlaybackService: MediaPlaybackLike;
  mediaImageStreamService: MediaImageStreamLike;
  getById(mediaId: string): Promise<MediaItem>;
}

export async function scanValue(
  context: MediaPlaybackOpsContext,
  libraryPath?: string,
  libraryPaths?: string[],
) {
  const existing = context.mediaScanStore.get();
  if (existing.status === 'running') {
    return existing;
  }

  const sourcePaths = await context.mediaFileResolutionService.resolveScanLocations(
    libraryPath,
    libraryPaths,
  );

  if (sourcePaths.length === 0) {
    throw new NotFoundException(
      'No media locations configured. Add locations in settings or set MEDIA_LIBRARY_PATH.',
    );
  }

  const scanId = randomUUID();
  const started = context.mediaScanStore.start(scanId, sourcePaths);
  void context.mediaScanExecutionService.runScan(scanId, sourcePaths);

  return started;
}

export async function getPlaybackAudioTracksValue(
  context: MediaPlaybackOpsContext,
  mediaId: string,
): Promise<PlaybackAudioTrack[]> {
  const item = await context.getById(mediaId);
  return context.mediaPlaybackService.getPlaybackAudioTracks(item);
}

export async function getPlaybackPlanValue(
  context: MediaPlaybackOpsContext,
  mediaId: string,
) {
  const item = await context.getById(mediaId);
  return context.mediaPlaybackService.getPlaybackPlan(item);
}

export function getTorrentDownloadProgressByMediaIdsValue(
  context: MediaPlaybackOpsContext,
  mediaIds: string[],
): Promise<{ items: MediaTorrentDownloadProgressItem[] }> {
  return context.mediaPlaybackService.getTorrentDownloadProgressByMediaIds(mediaIds);
}

export async function streamPreviewImageValue(
  context: MediaPlaybackOpsContext,
  mediaId: string,
  response: Response,
): Promise<void> {
  const item = await context.getById(mediaId);
  await context.mediaImageStreamService.streamPreviewImage(item, response);
}

export async function streamBackdropImageValue(
  context: MediaPlaybackOpsContext,
  mediaId: string,
  response: Response,
): Promise<void> {
  const item = await context.getById(mediaId);
  await context.mediaImageStreamService.streamBackdropImage(item, response);
}

export async function streamChapterThumbnailValue(
  context: MediaPlaybackOpsContext,
  mediaId: string,
  index: number,
  response: Response,
): Promise<void> {
  const item = await context.getById(mediaId);
  await context.mediaImageStreamService.streamChapterThumbnail(item, index, response);
}
