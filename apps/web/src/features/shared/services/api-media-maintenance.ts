import type {
  ApiCacheClearResult,
  MediaItem,
  MediaMetadataClearResult,
  MediaMetadataExportPayload,
  MediaMetadataImportResult,
  MediaScanProgress,
  MediaStats,
  MetadataImportMode,
  PlaybackPlan,
  PurgeRecycleDeletionsResult,
  RecycleDeletionsListResponse,
  SeriesEpisodeTrackerResult,
} from './types';
import { jsonBody, request } from './api-core';

export async function clearMediaApiCaches(token: string) {
  return request<ApiCacheClearResult>(
    '/media/cache/clear',
    {
      method: 'POST',
    },
    token,
  );
}

export async function clearMediaMetadataIndex(token: string) {
  return request<MediaMetadataClearResult>(
    '/media/metadata/clear',
    {
      method: 'POST',
    },
    token,
  );
}

export async function listRecycleDeletions(token: string, limit?: number) {
  const query =
    typeof limit === 'number' && Number.isFinite(limit)
      ? `?limit=${encodeURIComponent(String(Math.floor(limit)))}`
      : '';

  return request<RecycleDeletionsListResponse>(
    `/media/recycle/deletions${query}`,
    {},
    token,
  );
}

export async function purgeRecycleDeletions(
  token: string,
  payload: {
    operationPaths?: string[];
    purgeAll?: boolean;
    olderThanDays?: number;
  },
) {
  return request<PurgeRecycleDeletionsResult>(
    '/media/recycle/deletions',
    {
      method: 'DELETE',
      body: jsonBody(payload),
    },
    token,
  );
}

export async function exportMediaMetadata(token: string) {
  return request<MediaMetadataExportPayload>(
    '/media/metadata/export',
    {},
    token,
  );
}

export async function importMediaMetadata(
  token: string,
  payload: {
    mode?: MetadataImportMode;
    file: File;
  },
) {
  const formData = new FormData();
  formData.append('file', payload.file, payload.file.name);

  if (payload.mode) {
    formData.set('mode', payload.mode);
  }

  return request<MediaMetadataImportResult>(
    '/media/metadata/import',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function scanLibrary(
  token: string,
  libraryPath?: string,
  libraryPaths?: string[],
) {
  return request<MediaScanProgress>(
    '/media/scan',
    {
      method: 'POST',
      body: jsonBody({ libraryPath, libraryPaths }),
    },
    token,
  );
}

export async function getMediaScanProgress(token: string) {
  return request<MediaScanProgress>('/media/scan/progress', {}, token);
}

export async function getMediaStats(token: string) {
  return request<MediaStats>('/media/stats', {}, token);
}

export async function getMedia(token: string, mediaId: string) {
  return request<MediaItem>(`/media/${mediaId}`, {}, token);
}

export async function getSeriesEpisodeTracker(token: string, mediaId: string) {
  return request<SeriesEpisodeTrackerResult>(
    `/media/${encodeURIComponent(mediaId)}/series-tracker`,
    {},
    token,
  );
}

export async function getEpisodeNavigation(token: string, mediaId: string) {
  return request<{
    previousEpisode: MediaItem | null;
    nextEpisode: MediaItem | null;
  }>(`/media/${encodeURIComponent(mediaId)}/next-episode`, {}, token);
}

export async function getRemoteMedia(token: string, remoteId: string) {
  return request<MediaItem>(
    `/media/remote/${encodeURIComponent(remoteId)}`,
    {},
    token,
  );
}

export function isRemoteMediaId(mediaId: string): boolean {
  return /^remote_(tmdb|jikan)_(movie|show)_[A-Za-z0-9-]{1,64}$/i.test(
    mediaId.trim(),
  );
}

export async function getPlaybackPlan(token: string, mediaId: string) {
  return request<PlaybackPlan>(`/media/${mediaId}/playback`, {}, token);
}

export interface FilenameDetectResult {
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  suggestedType: 'show' | 'other' | null;
}

export async function detectMediaFilename(token: string, mediaId: string) {
  return request<FilenameDetectResult>(
    `/media/${encodeURIComponent(mediaId)}/detect`,
    {},
    token,
  );
}
