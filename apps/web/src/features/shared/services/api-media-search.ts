import type {
  IptorrentsSearchResponse,
  MediaItem,
  MediaLocationsResponse,
  MediaStorageSummary,
  NyaaSearchResponse,
  NyaaSortDirection,
  NyaaSortField,
  SystemSettings,
  TorrentIntent,
  TorrentItem,
  TorrentOrderMode,
} from './types';
import { jsonBody, request } from './api-core';

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

export type IndexTorrentMediaResponse =
  | { status: 'indexed'; media: MediaItem }
  | { status: 'pending'; reason: string };

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
