import type {
  AdminAccountsActivityOverview,
  AdminManagedAccount,
  ApiCacheClearResult,
  AuthResponse,
  CreatedInvite,
  HlsSessionStats,
  HlsStartResponse,
  InviteStatus,
  IptorrentsSearchResponse,
  MediaMetadataClearResult,
  MediaMetadataExportPayload,
  MediaMetadataImportResult,
  MediaItem,
  MediaLocationsResponse,
  MediaStorageSummary,
  MediaScanProgress,
  MediaStats,
  MetadataImportMode,
  MediaTorrentDownloadProgressEntry,
  NyaaSearchResponse,
  NyaaSortDirection,
  NyaaSortField,
  PlaybackAudioTrack,
  PlaybackPlan,
  ProgressEntry,
  PurgeRecycleDeletionsResult,
  RecycleDeletionsListResponse,
  SeriesEpisodeTrackerResult,
  SeriesAssignmentRules,
  SubtitleTrack,
  SystemSettings,
  TorrentIntent,
  TorrentItem,
  TorrentOrderMode,
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
  const isMultipartBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!headers.has('Content-Type') && options.body && !isMultipartBody) {
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
  inviteToken: string;
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

export async function getInviteStatus(inviteToken: string) {
  const encodedToken = encodeURIComponent(inviteToken.trim());
  return request<InviteStatus>(`/auth/invites/${encodedToken}`);
}

export async function createInviteLink(token: string) {
  return request<CreatedInvite>(
    '/auth/invites',
    {
      method: 'POST',
    },
    token,
  );
}

export async function listAdminAccounts(token: string) {
  return request<{ accounts: AdminManagedAccount[] }>(
    '/auth/admin/accounts',
    {},
    token,
  );
}

export async function listAdminAccountsActivity(token: string) {
  return request<AdminAccountsActivityOverview>(
    '/auth/admin/accounts/activity',
    {},
    token,
  );
}

export async function updateAdminAccountInvites(
  token: string,
  accountId: string,
  invitesRemaining: number,
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/invites`,
    {
      method: 'PATCH',
      body: jsonBody({ invitesRemaining }),
    },
    token,
  );
}

export async function updateAdminAccountRole(
  token: string,
  accountId: string,
  role: 'admin' | 'sailer' | 'user',
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/role`,
    {
      method: 'PATCH',
      body: jsonBody({ role }),
    },
    token,
  );
}

export async function updateAdminAccountMaxBitrate(
  token: string,
  accountId: string,
  maxBitrateKbps: number | null,
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/max-bitrate`,
    {
      method: 'PATCH',
      body: jsonBody({ maxBitrateKbps }),
    },
    token,
  );
}

export async function updateAdminAccountProfile(
  token: string,
  accountId: string,
  input: {
    email: string;
    name: string;
  },
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/profile`,
    {
      method: 'PATCH',
      body: jsonBody(input),
    },
    token,
  );
}

export async function resetAdminAccountPassword(
  token: string,
  accountId: string,
  input: {
    newPassword: string;
  },
) {
  return request<{ message: string }>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/password/reset`,
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function createAdminAccount(
  token: string,
  input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
    maxBitrateKbps?: number | null;
  },
) {
  return request<AdminManagedAccount>(
    '/auth/admin/accounts',
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function me(token: string) {
  return request<User>('/auth/me', {}, token);
}

export async function updateMyProfile(
  token: string,
  input: {
    email: string;
    name: string;
  },
) {
  return request<User>(
    '/auth/me',
    {
      method: 'PATCH',
      body: jsonBody(input),
    },
    token,
  );
}

export async function changeMyPassword(
  token: string,
  input: {
    currentPassword: string;
    newPassword: string;
  },
) {
  return request<{ message: string }>(
    '/auth/me/password',
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function uploadMyAvatar(token: string, avatarFile: File) {
  const formData = new FormData();
  formData.append('avatar', avatarFile, avatarFile.name);

  return request<User>(
    '/auth/me/avatar',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function removeMyAvatar(token: string) {
  return request<User>(
    '/auth/me/avatar',
    {
      method: 'DELETE',
    },
    token,
  );
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

export interface RemoteMediaSearchResponse {
  query: string;
  providers: Array<'tmdb' | 'jikan'>;
  total: number;
  page: number;
  hasMore: boolean;
  items: MediaItem[];
}

export async function searchRemoteMedia(
  token: string,
  query: string,
  limit?: number,
  providers?: Array<'tmdb' | 'jikan'>,
  tags?: string[],
  noCache?: boolean,
  page?: number,
) {
  const params = new URLSearchParams();
  const cleanedQuery = query.trim();

  if (cleanedQuery) {
    params.set('q', cleanedQuery);
  }

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(Math.floor(limit)));
  }

  if (Array.isArray(providers) && providers.length > 0) {
    params.set('providers', providers.join(','));
  }

  const normalizedTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (normalizedTags.length > 0) {
    params.set('tags', normalizedTags.join(','));
  }

  if (noCache) {
    params.set('noCache', '1');
  }

  if (typeof page === 'number' && Number.isFinite(page)) {
    params.set('page', String(Math.max(1, Math.floor(page))));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<RemoteMediaSearchResponse>(`/media/search/remote${suffix}`, {}, token);
}

export async function searchIptorrents(
  token: string,
  query: string,
  options?: {
    limit?: number;
    mediaType?: 'movie' | 'show';
  },
) {
  const params = new URLSearchParams();
  const cleanedQuery = query.trim();

  if (cleanedQuery) {
    params.set('q', cleanedQuery);
  }

  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.floor(options.limit)));
  }

  if (options?.mediaType) {
    params.set('mediaType', options.mediaType);
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<IptorrentsSearchResponse>(
    `/media/search/iptorrents${suffix}`,
    {},
    token,
  );
}

export async function searchNyaa(
  token: string,
  query: string,
  options?: {
    limit?: number;
    category?: string;
    page?: number;
    sortBy?: NyaaSortField;
    sortDirection?: NyaaSortDirection;
  },
) {
  const params = new URLSearchParams();
  const cleanedQuery = query.trim();

  if (cleanedQuery) {
    params.set('q', cleanedQuery);
  }

  if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.floor(options.limit)));
  }

  if (options?.category) {
    params.set('category', options.category.trim());
  }

  if (typeof options?.page === 'number' && Number.isFinite(options.page)) {
    params.set('page', String(Math.max(1, Math.floor(options.page))));
  }

  if (options?.sortBy) {
    params.set('sortBy', options.sortBy);
  }

  if (options?.sortDirection) {
    params.set('sortDirection', options.sortDirection);
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<NyaaSearchResponse>(
    `/media/search/nyaa${suffix}`,
    {},
    token,
  );
}

export interface StartIptorrentsDownloadPayload {
  downloadUrl: string;
  title?: string;
  savePath?: string;
  intent?: TorrentIntent;
  metadataHint?: {
    title?: string;
    normalizedTitle?: string;
    releaseYear?: number | null;
    mediaType?: 'movie' | 'show' | 'other';
    description?: string | null;
    tags?: string[];
    posterUrl?: string | null;
    backdropUrl?: string | null;
    remoteSource?: 'tmdb' | 'jikan' | null;
    remoteSourceId?: string | null;
  };
}

export async function startIptorrentsDownload(
  token: string,
  payload: StartIptorrentsDownloadPayload,
) {
  return request<{
    message: string;
    orderMode: TorrentOrderMode;
    intent: TorrentIntent | null;
    hash: string | null;
    indexResult: IndexTorrentMediaResponse | null;
  }>(
    '/media/search/iptorrents/download',
    {
      method: 'POST',
      body: jsonBody(payload),
    },
    token,
  );
}

export async function startNyaaDownload(
  token: string,
  payload: StartIptorrentsDownloadPayload,
) {
  return request<{
    message: string;
    orderMode: TorrentOrderMode;
    intent: TorrentIntent | null;
    hash: string | null;
    indexResult: IndexTorrentMediaResponse | null;
  }>(
    '/media/search/nyaa/download',
    {
      method: 'POST',
      body: jsonBody(payload),
    },
    token,
  );
}

export type IndexTorrentMediaResponse =
  | { status: 'indexed'; media: MediaItem }
  | { status: 'pending'; reason: string };

export async function indexTorrentMedia(token: string, hash: string) {
  return request<IndexTorrentMediaResponse>(
    `/media/torrent/${encodeURIComponent(hash)}/index`,
    {
      method: 'POST',
    },
    token,
  );
}

export interface TorrentStatusResponse {
  indexResult: IndexTorrentMediaResponse;
  torrent: TorrentItem | null;
}

export async function getTorrentStatus(token: string, hash: string) {
  return request<TorrentStatusResponse>(
    `/media/torrent/${encodeURIComponent(hash)}/status`,
    {},
    token,
  );
}

export async function getMediaLocations(token: string) {
  return request<MediaLocationsResponse>('/media/locations', {}, token);
}

export async function getMediaStorageSummary(token: string) {
  return request<MediaStorageSummary>('/media/storage-summary', {}, token);
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

export interface ListTorrentsResponse {
  items: TorrentItem[];
}

export interface AddTorrentPayload {
  magnetLink?: string;
  savePath?: string;
  paused?: boolean;
  intent?: TorrentIntent;
  orderMode?: TorrentOrderMode;
  torrentFile?: File | null;
}

export async function listTorrents(token: string) {
  return request<ListTorrentsResponse>('/torrents', {}, token);
}

export async function addTorrent(token: string, payload: AddTorrentPayload) {
  const formData = new FormData();

  const magnetLink = payload.magnetLink?.trim();
  if (magnetLink) {
    formData.set('magnetLink', magnetLink);
  }

  if (payload.torrentFile) {
    formData.append('torrentFile', payload.torrentFile, payload.torrentFile.name);
  }

  const savePath = payload.savePath?.trim();
  if (savePath) {
    formData.set('savePath', savePath);
  }

  if (typeof payload.paused === 'boolean') {
    formData.set('paused', payload.paused ? 'true' : 'false');
  }

  if (payload.intent) {
    formData.set('intent', payload.intent);
  }

  if (payload.orderMode) {
    formData.set('orderMode', payload.orderMode);
  }

  return request<{ message: string; orderMode: TorrentOrderMode; intent: TorrentIntent | null }>(
    '/torrents/add',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function startTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/start`,
    { method: 'POST' },
    token,
  );
}

export async function stopTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/stop`,
    { method: 'POST' },
    token,
  );
}

export async function restartTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/restart`,
    { method: 'POST' },
    token,
  );
}

export async function deleteTorrent(
  token: string,
  hash: string,
  deleteFiles: boolean,
) {
  return request<{ hash: string; deleteFiles: boolean; message: string }>(
    `/torrents/${encodeURIComponent(hash)}`,
    {
      method: 'DELETE',
      body: jsonBody({ deleteFiles }),
    },
    token,
  );
}

export async function setTorrentOrderMode(
  token: string,
  hash: string,
  orderMode: TorrentOrderMode,
) {
  return request<{
    hash: string;
    orderMode: TorrentOrderMode;
    sequentialChanged: boolean;
    firstLastPiecePriorityChanged: boolean;
    message: string;
  }>(
    `/torrents/${encodeURIComponent(hash)}/order-mode`,
    {
      method: 'PATCH',
      body: jsonBody({ orderMode }),
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
  remoteSource: 'tmdb' | 'jikan';
  remoteSourceId: string;
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
  options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  },
) {
  const params = new URLSearchParams();
  if (options?.forceFresh) {
    params.set('force', '1');
  }

  if (
    typeof options?.audioStreamIndex === 'number'
    && Number.isInteger(options.audioStreamIndex)
    && options.audioStreamIndex >= 0
  ) {
    params.set('audioStreamIndex', String(options.audioStreamIndex));
  }

  if (
    typeof options?.maxVideoBitrateKbps === 'number'
    && Number.isInteger(options.maxVideoBitrateKbps)
    && options.maxVideoBitrateKbps > 0
  ) {
    params.set('maxVideoBitrateKbps', String(options.maxVideoBitrateKbps));
  }

  if (
    typeof options?.audioBitrateKbps === 'number'
    && Number.isInteger(options.audioBitrateKbps)
    && options.audioBitrateKbps > 0
  ) {
    params.set('audioBitrateKbps', String(options.audioBitrateKbps));
  }

  if (
    typeof options?.maxOutputHeight === 'number'
    && Number.isInteger(options.maxOutputHeight)
    && options.maxOutputHeight > 0
  ) {
    params.set('maxOutputHeight', String(options.maxOutputHeight));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<HlsStartResponse>(
    `/stream/${mediaId}/hls/start${suffix}`,
    { method: 'POST' },
    token,
  );
}

export async function listPlaybackAudioTracks(token: string, mediaId: string) {
  const payload = await request<{ tracks: PlaybackAudioTrack[] }>(
    `/stream/${mediaId}/audio-tracks`,
    {},
    token,
  );
  return payload.tracks;
}

export async function getHlsSessionStats(token: string, sessionId: string) {
  return request<HlsSessionStats>(
    `/stream/hls/${encodeURIComponent(sessionId)}/debug/stats`,
    { method: 'GET' },
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
  return request<ProgressEntry[]>('/progress', { cache: 'no-store' }, token);
}

export async function listMediaTorrentDownloadProgress(
  token: string,
  mediaIds: string[],
) {
  const normalizedMediaIds = [...new Set(
    mediaIds
      .map((mediaId) => mediaId.trim())
      .filter((mediaId) => mediaId.length > 0),
  )];

  if (normalizedMediaIds.length === 0) {
    return { items: [] as MediaTorrentDownloadProgressEntry[] };
  }

  return request<{ items: MediaTorrentDownloadProgressEntry[] }>(
    '/media/torrent/download-progress',
    {
      method: 'POST',
      body: jsonBody({ mediaIds: normalizedMediaIds }),
    },
    token,
  );
}

export async function upsertProgress(
  token: string,
  mediaId: string,
  payload: {
    positionSeconds: number;
    durationSeconds: number;
    syncTimestampMs?: number;
    completed?: boolean;
    seriesPreferenceKey?: string | null;
    preferredAudioLanguage?: string | null;
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  },
  options?: {
    keepalive?: boolean;
  },
) {
  return request<ProgressEntry>(`/progress/${mediaId}`, {
    method: 'PUT',
    body: jsonBody(payload),
    keepalive: options?.keepalive,
    cache: 'no-store',
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
