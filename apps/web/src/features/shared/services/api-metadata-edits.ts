import type {
  MediaItem,
  SeriesAssignmentRules,
} from './types';
import { jsonBody, request } from './api-core';

export interface MediaMetadataPatch {
  title?: string;
  description?: string | null;
  releaseYear?: number | null;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  tags?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
  remoteSource?: 'tmdb' | 'jikan' | null;
  remoteSourceId?: string | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}

export interface BulkAssignEpisodesPayload {
  mediaIds: string[];
  title: string;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  startEpisodeNumber?: number;
  episodeOrder?: 'filename-asc' | 'existing-episode' | 'as-provided';
  tags?: string[];
  releaseYear?: number | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}

export async function updateMediaMetadata(
  token: string,
  mediaId: string,
  patch: MediaMetadataPatch,
) {
  return request<MediaItem>(
    `/media/${encodeURIComponent(mediaId)}`,
    {
      method: 'PATCH',
      body: jsonBody(patch),
    },
    token,
  );
}

export async function bulkAssignEpisodes(
  token: string,
  payload: BulkAssignEpisodesPayload,
) {
  return request<{ updatedCount: number; items: MediaItem[] }>(
    '/media/bulk/assign-episodes',
    {
      method: 'POST',
      body: jsonBody(payload),
    },
    token,
  );
}

export async function bulkUpdateMediaMetadata(
  token: string,
  mediaIds: string[],
  patch: MediaMetadataPatch,
) {
  return request<{ updatedCount: number; items: MediaItem[] }>(
    '/media/bulk/update',
    {
      method: 'POST',
      body: jsonBody({ mediaIds, patch }),
    },
    token,
  );
}

export interface DeletedMediaItemResult {
  mediaId: string;
  title: string;
  success: boolean;
  deletedEntries: number;
  error?: string;
}

export interface BulkDeleteMediaResult {
  requested: number;
  deleted: number;
  failed: number;
  results: DeletedMediaItemResult[];
}

export async function bulkDeleteMediaPermanently(
  token: string,
  mediaIds: string[],
) {
  return request<BulkDeleteMediaResult>(
    '/media/bulk/permanent',
    {
      method: 'DELETE',
      body: jsonBody({ mediaIds }),
    },
    token,
  );
}

export interface PlannedMediaChange {
  mediaId: string;
  title: string;
  type: 'movie' | 'show' | 'other';
  currentPath: string;
  targetPath: string;
  willMove: boolean;
  sidecars: Array<{ from: string; to: string }>;
  nfoPath: string | null;
  reason?: string;
  skipped?: boolean;
}

export interface CommitPlanResponse {
  changes: PlannedMediaChange[];
  skipped: PlannedMediaChange[];
  summary: {
    totalItems: number;
    movableItems: number;
    skippedItems: number;
    sidecars: number;
    nfoFiles: number;
  };
}

export interface CommitApplyResponse {
  commitId: string;
  summary: {
    totalItems: number;
    filesRenamed: number;
    sidecarsMoved: number;
    nfoFilesWritten: number;
    directoriesCreated: number;
    errors: number;
  };
  changes: Array<{
    mediaId: string;
    title: string;
    from: string;
    to: string;
    sidecarCount: number;
    nfoWritten: boolean;
    error?: string;
  }>;
  integrationWarnings?: string[];
}

export interface CommitHistoryEntry {
  id: string;
  createdAt: string;
  summary: CommitApplyResponse['summary'];
  rolledBackAt: string | null;
  rollbackErrors?: string[];
}

export interface CommitRollbackResponse {
  commitId: string;
  reverted: number;
  errors: string[];
}

export interface CommitChainRollbackResponse {
  targetCommitId: string;
  totalToRollback: number;
  completed: number;
  failedAt: string | null;
  results: Array<{
    commitId: string;
    reverted: number;
    errors: string[];
    success: boolean;
  }>;
}

export async function planMetadataCommit(
  token: string,
  mediaIds?: string[],
) {
  return request<CommitPlanResponse>(
    '/media/commit/plan',
    {
      method: 'POST',
      body: jsonBody({ mediaIds }),
    },
    token,
  );
}

export async function applyMetadataCommit(
  token: string,
  options: { mediaIds?: string[]; writeNfo?: boolean } = {},
) {
  return request<CommitApplyResponse>(
    '/media/commit/apply',
    {
      method: 'POST',
      body: jsonBody(options),
    },
    token,
  );
}

export async function listMetadataCommitHistory(token: string) {
  return request<CommitHistoryEntry[]>(
    '/media/commit/history',
    {},
    token,
  );
}

export async function rollbackMetadataCommit(
  token: string,
  commitId: string,
) {
  return request<CommitRollbackResponse>(
    `/media/commit/rollback/${encodeURIComponent(commitId)}`,
    { method: 'POST' },
    token,
  );
}

export async function rollbackToMetadataCommit(
  token: string,
  commitId: string,
) {
  return request<CommitChainRollbackResponse>(
    `/media/commit/rollback-to/${encodeURIComponent(commitId)}`,
    { method: 'POST' },
    token,
  );
}
