import type {
  ApiCacheClearResult,
  AuthResponse,
  HlsStartResponse,
  MediaMetadataClearResult,
  MediaItem,
  MediaLocationsResponse,
  MediaScanProgress,
  MediaStats,
  PlaybackPlan,
  ProgressEntry,
  SubtitleTrack,
  SystemSettings,
  User,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;
const API_BASE_TRIMMED = API_BASE.replace(/\/+$/, '');

export const TOKEN_STORAGE_KEY = 'yeen_access_token';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function jsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as { message?: string | string[] };
      const message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : payload.message ?? fallback;
      throw new ApiError(message, response.status);
    } catch {
      throw new ApiError(fallback, response.status);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function register(input: {
  email: string;
  name: string;
  password: string;
}) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function me(token: string) {
  return request<User>('/auth/me', {}, token);
}

export async function listMedia(token: string, query?: string, tags?: string[]) {
  const params = new URLSearchParams();

  const normalizedQuery = query?.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const normalizedTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (normalizedTags.length > 0) {
    params.set('tags', normalizedTags.join(','));
  }

  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return request<MediaItem[]>(`/media${suffix}`, {}, token);
}

export async function getMediaLocations(token: string) {
  return request<MediaLocationsResponse>('/media/locations', {}, token);
}

export async function setMediaLocations(token: string, locations: string[]) {
  return request<MediaLocationsResponse>(
    '/media/locations',
    {
      method: 'PUT',
      body: jsonBody({ locations }),
    },
    token,
  );
}

export async function getSystemSettings(token: string) {
  return request<SystemSettings>('/system-settings', {}, token);
}

export async function updateSystemSettings(
  token: string,
  payload: SystemSettings,
) {
  return request<SystemSettings>(
    '/system-settings',
    {
      method: 'PUT',
      body: jsonBody(payload),
    },
    token,
  );
}

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

export interface MetadataSearchCandidate {
  title: string;
  mediaType: 'movie' | 'show' | 'other';
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

export async function searchMetadataCandidates(
  token: string,
  params: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year?: number | null;
    limit?: number;
    signal?: AbortSignal;
  },
) {
  const search = new URLSearchParams({
    title: params.title,
    type: params.type,
  });
  if (typeof params.year === 'number' && Number.isFinite(params.year)) {
    search.set('year', String(params.year));
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    search.set('limit', String(params.limit));
  }
  return request<{ candidates: MetadataSearchCandidate[] }>(
    `/media/metadata/search?${search.toString()}`,
    { method: 'GET', signal: params.signal },
    token,
  );
}

export async function startHlsSession(
  token: string,
  mediaId: string,
  forceFresh = false,
) {
  const suffix = forceFresh ? '?force=1' : '';
  return request<HlsStartResponse>(
    `/stream/${mediaId}/hls/start${suffix}`,
    { method: 'POST' },
    token,
  );
}

export async function listSubtitleTracks(token: string, mediaId: string) {
  const payload = await request<{ tracks: SubtitleTrack[] }>(`/subtitles/${mediaId}`, {}, token);
  return payload.tracks;
}

export async function extractSubtitle(token: string, mediaId: string, streamIndex: number) {
  return request<{ mediaId: string; streamIndex: number; url: string }>(
    `/subtitles/${mediaId}/extract`,
    {
      method: 'POST',
      body: jsonBody({ streamIndex }),
    },
    token,
  );
}

export async function listProgress(token: string) {
  return request<ProgressEntry[]>('/progress', {}, token);
}

export async function upsertProgress(
  token: string,
  mediaId: string,
  payload: {
    positionSeconds: number;
    durationSeconds: number;
    completed?: boolean;
  },
) {
  return request<ProgressEntry>(`/progress/${mediaId}`, {
    method: 'PUT',
    body: jsonBody(payload),
  }, token);
}

export function toApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function absoluteApiUrl(path: string) {
  return resolveApiUrl(path);
}

export function withAccessToken(path: string, token: string) {
  const candidateUrl = resolveApiUrl(path);

  if (!token) {
    return candidateUrl;
  }

  try {
    const url = new URL(candidateUrl);
    url.searchParams.set('access_token', token);
    return url.toString();
  } catch {
    return candidateUrl;
  }
}

export function mediaPreviewImageUrl(
  mediaId: string,
  version?: string | number | null,
) {
  return withVersionQuery(
    absoluteApiUrl(`/media-images/${encodeURIComponent(mediaId)}/preview`),
    version,
  );
}

export function mediaBackdropImageUrl(
  mediaId: string,
  version?: string | number | null,
) {
  return withVersionQuery(
    absoluteApiUrl(`/media-images/${encodeURIComponent(mediaId)}/backdrop`),
    version,
  );
}

export function mediaChapterThumbnailUrl(mediaId: string, index: number) {
  return absoluteApiUrl(
    `/media-images/${encodeURIComponent(mediaId)}/chapter/${index}`,
  );
}

function withVersionQuery(url: string, version: string | number | null | undefined) {
  if (version === null || version === undefined || version === '') {
    return url;
  }

  const stringVersion = String(version);
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', stringVersion);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(stringVersion)}`;
  }
}

function resolveApiUrl(path: string) {
  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }

  const normalizedPath = normalizeApiPath(path);
  return `${API_BASE_TRIMMED}${normalizedPath}`;
}

function normalizeApiPath(path: string) {
  const candidate = path.trim();
  const pathWithLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;

  if (/\/api$/i.test(API_BASE_TRIMMED) && /^\/api(?:\/|$)/i.test(pathWithLeadingSlash)) {
    const pathWithoutDuplicateApiPrefix = pathWithLeadingSlash.slice('/api'.length);
    return pathWithoutDuplicateApiPrefix || '/';
  }

  return pathWithLeadingSlash;
}

export { ApiError };
